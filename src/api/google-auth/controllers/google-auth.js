"use strict";

module.exports = {
  async googleLogin(ctx) {
    const { access_token } = ctx.request.body;

    if (!access_token) {
      return ctx.badRequest("Missing access token");
    }

    try {
      console.log("🟡 ACCESS TOKEN:", access_token);

      // =====================================================
      // 🟢 GET GOOGLE USER DATA
      // =====================================================

      const googleRes = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        },
      );

      const googleUser = await googleRes.json();

      console.log("🟢 GOOGLE USER RAW:", googleUser);

      const email = googleUser.email;
      const googleId = googleUser.sub;

      const avatar = googleUser.picture?.replace("=s96-c", "=s400-c");

      if (!email) {
        return ctx.badRequest("No email from Google");
      }

      const firstName =
        googleUser.given_name || googleUser.name?.split(" ")[0] || "";

      const lastName =
        googleUser.family_name ||
        googleUser.name?.split(" ").slice(1).join(" ") ||
        "";

      console.log("🟢 FIRST NAME:", firstName);
      console.log("🟢 LAST NAME:", lastName);

      // =====================================================
      // 🔥 GET AUTHENTICATED ROLE
      // =====================================================

      const authenticatedRole = await strapi
        .query("plugin::users-permissions.role")
        .findOne({
          where: {
            type: "authenticated",
          },
        });

      const userQuery = strapi.query("plugin::users-permissions.user");

      let user = await userQuery.findOne({
        where: { email },
        populate: ["role"],
      });

      // =====================================================
      // 🔥 EXISTING USER
      // =====================================================

      if (user) {
        console.log("🟡 EXISTING USER:", user.id);

        // Fix missing role for old users
        if (!user.role) {
          await userQuery.update({
            where: { id: user.id },
            data: {
              role: authenticatedRole.id,
            },
          });

          user.role = authenticatedRole;
        }

        // Update provider if needed
        if (user.provider !== "google") {
          await userQuery.update({
            where: { id: user.id },
            data: {
              provider: "google",
              provider_id: googleId,
              confirmed: true,
            },
          });
        }
      }

      // =====================================================
      // 🆕 CREATE NEW USER
      // =====================================================
      else {
        user = await userQuery.create({
          data: {
            username: firstName || email,
            email,
            provider: "google",
            provider_id: googleId,
            confirmed: true,
            role: authenticatedRole.id,
          },
        });

        console.log("🟢 NEW USER CREATED:", user.id);
      }

      // =====================================================
      // 🖼️ UPLOAD PROFILE IMAGE
      // =====================================================

      let uploadedImageId = null;

      if (avatar) {
        try {
          console.log("🖼️ Downloading image from Google...");

          const imageRes = await fetch(avatar);
          const arrayBuffer = await imageRes.arrayBuffer();

          const blob = new Blob([arrayBuffer], {
            type: "image/jpeg",
          });

          const formData = new FormData();

          formData.append("files", blob, "google-profile.jpg");
          console.log(
            "UPLOAD URL:",
            `${process.env.STRAPI_API_URL}api/upload`,
          );
          const uploadRes = await fetch(
            `${process.env.STRAPI_API_URL}/api/upload`,
            {
              method: "POST",
              body: formData,
            },
          );

          const uploaded = await uploadRes.json();

          console.log("🟢 Uploaded Image:", uploaded);

          uploadedImageId = uploaded?.[0]?.id || null;
        } catch (err) {
          console.log("⚠️ Image upload failed:", err);
        }
      }

      // =====================================================
      // 👤 USER DETAIL CREATE / UPDATE
      // =====================================================

      const existingDetail = await strapi.db
        .query("api::user-detail.user-detail")
        .findOne({
          where: { user: user.id },
        });

      if (existingDetail) {
        console.log("🔵 UPDATING USER DETAIL");

        await strapi.entityService.update(
          "api::user-detail.user-detail",
          existingDetail.id,
          {
            data: {
              firstName,
              lastName,
              ...(uploadedImageId && {
                profileImage: uploadedImageId,
              }),
            },
          },
        );
      } else {
        console.log("🟢 CREATING USER DETAIL");

        await strapi.entityService.create("api::user-detail.user-detail", {
          data: {
            user: user.id,
            firstName,
            lastName,
            ...(uploadedImageId && {
              profileImage: uploadedImageId,
            }),
          },
        });
      }

      // =====================================================
      // 🔐 ISSUE JWT
      // =====================================================

      const jwt = strapi.plugin("users-permissions").service("jwt").issue({
        id: user.id,
      });

      console.log("GENERATED JWT:", jwt);

      return ctx.send({
        jwt,
        user,
      });
    } catch (err) {
      console.error("🔥 Google auth error:", err);

      return ctx.internalServerError("Something went wrong");
    }
  },
};
