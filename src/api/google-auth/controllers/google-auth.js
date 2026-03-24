"use strict";

module.exports = {
  async googleLogin(ctx) {
    const { access_token } = ctx.request.body;

    if (!access_token) {
      return ctx.badRequest("Missing access token");
    }

    try {
      // 🟢 1. Get Google user
      const googleRes = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        }
      );

      const googleUser = await googleRes.json();

      const email = googleUser.email;
      const googleId = googleUser.sub;
      const name = googleUser.name;
      const avatar = googleUser.picture;

      if (!email) {
        return ctx.badRequest("No email from Google");
      }

      const userQuery = strapi.query("plugin::users-permissions.user");

      let user = await userQuery.findOne({
        where: { email },
      });

      let isNewUser = false;

      // 🔥 EXISTING USER
      if (user) {
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
      } else {
        // 🆕 NEW USER
        isNewUser = true;

        user = await userQuery.create({
          data: {
            username: email,
            email,
            provider: "google",
            provider_id: googleId,
            confirmed: true,
          },
        });
      }

      // 🔥 ISSUE JWT
      const jwt = strapi
        .plugin("users-permissions")
        .service("jwt")
        .issue({ id: user.id });

      // 🟢 OPTIONAL: create profile ONLY for new user
      if (isNewUser) {
        try {
          await strapi.entityService.create("api::user-detail.user-detail", {
            data: {
              user: user.id,
              name,
              avatar,
            },
          });
        } catch (err) {
          console.log("⚠️ userDetails creation skipped:", err.message);
        }
      }

      return ctx.send({
        jwt,
        user,
      });
    } catch (err) {
      console.error("Google auth error:", err);
      return ctx.internalServerError("Something went wrong");
    }
  },
};