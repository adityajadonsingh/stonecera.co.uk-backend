"use strict";

const redisService = require("../../../utils/redis");

function buildAbsoluteUrl(url) {
  if (!url) return null;

  const base =
    (strapi?.config?.get && strapi.config.get("server.url")) ||
    process.env.STRAPI_API_URL ||
    `http://localhost:${process.env.PORT || 1337}`;

  return url.startsWith("http") ? url : `${base.replace(/\/$/, "")}${url}`;
}

module.exports = {
  async get(ctx) {
    try {
      // 🔥 GET TOKEN
      const authHeader = ctx.request.header.authorization;

      if (!authHeader) {
        return ctx.unauthorized("No token");
      }

      const token = authHeader.replace("Bearer ", "");

      // 🔥 VERIFY TOKEN MANUALLY
      let decoded;
      try {
        decoded = await strapi
          .plugin("users-permissions")
          .service("jwt")
          .verify(token);
      } catch (err) {
        return ctx.unauthorized("Invalid token");
      }
      console.log("🔥 TOKEN:", token);
      console.log("🔥 DECODED:", decoded);
      const userId = decoded?.id || decoded?.sub;

      if (!userId) {
        return ctx.unauthorized("Invalid token payload");
      }

      // 🔥 FETCH USER
      const user = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        userId,
      );

      if (!user) {
        return ctx.unauthorized("User not found");
      }

      const client = await redisService.connect();
      const key = `user:details:${user.id}`;

      // CACHE CHECK
      const cached = await client.get(key);
      if (cached) {
        const data = JSON.parse(cached);
        return ctx.send({ source: "redis", ...data });
      }

      // 2️⃣ DB FETCH
      const record = await strapi.db
        .query("api::user-detail.user-detail")
        .findOne({
          where: { user: user.id },
          populate: {
            profileImage: true,
            phoneNumbers: true,
            savedAddresses: true,
          },
        });

      const userDetails = record
        ? {
            id: record.id,
            firstName: record.firstName ?? null,
            lastName: record.lastName ?? null,
            profileImage: record.profileImage
              ? {
                  ...record.profileImage,
                  url: buildAbsoluteUrl(record.profileImage.url),
                }
              : null,
            phoneNumbers: record.phoneNumbers ?? [],
            savedAddresses: record.savedAddresses ?? [],
          }
        : null;
          console.log(userDetails);
      const payload = {
        id: user.id,
        username: user.username ?? null,
        email: user.email ?? null,
        userDetails,
      };

      // SAVE CACHE
      await client.set(key, JSON.stringify(payload), { EX: 300 });

      return ctx.send({ source: "db", ...payload });
    } catch (err) {
      strapi.log.error("user-detail-redis.get error", err);
      return ctx.internalServerError("Server error");
    }
  },

  async clear(ctx) {
    try {
      const authHeader = ctx.request.header.authorization;

      if (!authHeader) {
        return ctx.unauthorized();
      }

      const token = authHeader.replace("Bearer ", "");

      const decoded = strapi
        .plugin("users-permissions")
        .service("jwt")
        .verify(token);

      const client = await redisService.connect();
      const key = `user:details:${decoded.id}`;

      await client.del(key);

      return ctx.send({ ok: true });
    } catch (err) {
      strapi.log.error("user-detail-redis.clear error", err);
      return ctx.internalServerError("Server error");
    }
  },
};
