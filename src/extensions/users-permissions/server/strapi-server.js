"use strict";

module.exports = (plugin) => {
  const originalCallback = plugin.controllers.auth.callback;

  plugin.controllers.auth.callback = async (ctx) => {
    const provider = ctx.params.provider;

    console.log("🔥 OVERRIDE RUNNING, provider:", provider);

    if (provider === "google") {
      const { id_token } = ctx.query;

      if (id_token) {
        try {
          const payload = JSON.parse(
            Buffer.from(id_token.split(".")[1], "base64").toString()
          );

          const email = payload.email;

          console.log("📧 Google email:", email);

          if (email) {
            const userQuery = strapi.db.query(
              "plugin::users-permissions.user"
            );

            const existingUser = await userQuery.findOne({
              where: { email },
            });

            if (existingUser && existingUser.provider !== "google") {
              console.log("🔗 Linking account:", email);

              await userQuery.update({
                where: { id: existingUser.id },
                data: {
                  provider: "google",
                  confirmed: true,
                },
              });
            }
          }
        } catch (err) {
          console.error("❌ Token decode error:", err);
        }
      }
    }

    return originalCallback(ctx);
  };

  return plugin;
};