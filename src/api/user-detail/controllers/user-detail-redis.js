// backend/src/api/user-detail/controllers/user-detail-redis.js
"use strict";

const redisService = require("../../../utils/redis");

/* Helpers ------------------------------------------------------------------ */
function buildAbsoluteUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const base =
    (strapi?.config?.get && strapi.config.get("server.url")) ||
    process.env.STRAPI_API_URL ||
    `http://localhost:${process.env.PORT || 1337}`;
  return `${String(base).replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function normalizeMedia(media) {
  if (!media) return null;
  const m = media.data ?? media;
  const attrs = m.attributes ?? m;
  const url = attrs.url ?? null;
  return {
    id: m.id ?? attrs.id ?? null,
    url: url ? buildAbsoluteUrl(url) : null,
    name: attrs.name ?? null,
    alternativeText: attrs.alternativeText ?? attrs.alternative_text ?? null,
  };
}

/* Controller --------------------------------------------------------------- */
module.exports = {
  // GET /api/user-details/redis
  async get(ctx) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized("You must be logged in"); 

      const client = await redisService.connect();
      const key = `user:details:${user.id}`;

      // 1️⃣ check cache
      const cached = await client.get(key);
      if (cached) {
        const data = JSON.parse(cached);
        return ctx.send({ source: "redis", ...data });
      }

      // 2️⃣ fallback query
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
            fullName: record.fullName ?? null,
            profileImage: normalizeMedia(record.profileImage),
            phoneNumbers: record.phoneNumbers ?? [],
            savedAddresses: record.savedAddresses ?? [],
          }
        : null;

      const payload = {
        id: user.id,
        username: user.username ?? null,
        email: user.email ?? null,
        userDetails,
      };
      

      // 3️⃣ save to cache (5 min TTL)
      await client.set(key, JSON.stringify(payload), { EX: 300 });

      ctx.send({ source: "db", ...payload });
    } catch (err) {
      strapi.log.error("user-detail-redis.get error", err);
      ctx.internalServerError("Server error");
    }
  },

  // DELETE /api/user-details/redis/clear
  async clear(ctx) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized();

      const client = await redisService.connect();
      const key = `user:details:${user.id}`;
      await client.del(key);
      ctx.send({ ok: true, cleared: key });
    } catch (err) {
      strapi.log.error("user-detail-redis.clear error", err);
      ctx.internalServerError("Server error");
    }
  },
};