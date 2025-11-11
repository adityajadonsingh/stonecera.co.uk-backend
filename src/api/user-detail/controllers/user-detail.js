"use strict";

/**
 * Small helpers to normalize media URLs and Strapi entity shapes
 */
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

module.exports = {
  // GET /api/user-details/me
  async me(ctx) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized("You must be logged in");

      const record = await strapi.db.query("api::user-detail.user-detail").findOne({
        where: { user: user.id },
        populate: { profileImage: true, phoneNumbers: true, savedAddresses: true },
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

      return ctx.send({
        id: user.id,
        username: user.username ?? null,
        email: user.email ?? null,
        userDetails,
      });
    } catch (err) {
      strapi.log.error("user-detail.me error", err);
      return ctx.internalServerError("Server error");
    }
  },

  // POST /api/user-details/me -> create or update current user's details
  async upsert(ctx) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized("You must be logged in");

      const body = ctx.request.body ?? {};
      // Accept payload keys: fullName, phoneNumbers (array), savedAddresses (array), profileImageId (number)
      const fullName = typeof body.fullName === "string" ? body.fullName : undefined;
      const phoneNumbers = Array.isArray(body.phoneNumbers) ? body.phoneNumbers : undefined;
      const savedAddresses = Array.isArray(body.savedAddresses) ? body.savedAddresses : undefined;

      let profileImageId = null;
      if (body.profileImageId !== undefined && body.profileImageId !== null) {
        const idNum = Number(body.profileImageId);
        if (!Number.isNaN(idNum)) profileImageId = idNum;
      }

      // Find existing record for this user
      const existing = await strapi.db.query("api::user-detail.user-detail").findOne({
        where: { user: user.id },
      });

      if (existing) {
        const updateData = {};
        if (fullName !== undefined) updateData.fullName = fullName;
        if (phoneNumbers !== undefined) updateData.phoneNumbers = phoneNumbers;
        if (savedAddresses !== undefined) updateData.savedAddresses = savedAddresses;
        // For profileImage: if profileImageId is provided, set it; if explicitly null provided, clear it.
        if (profileImageId !== null) updateData.profileImage = profileImageId;
        else if (body.profileImageId === null) updateData.profileImage = null;

        const updated = await strapi.entityService.update("api::user-detail.user-detail", existing.id, {
          data: updateData,
        });

        // reload with media/components populated for consistent shape
        const fetched = await strapi.db.query("api::user-detail.user-detail").findOne({
          where: { id: updated.id },
          populate: { profileImage: true, phoneNumbers: true, savedAddresses: true },
        });

        const userDetails = fetched
          ? {
              id: fetched.id,
              fullName: fetched.fullName ?? null,
              profileImage: normalizeMedia(fetched.profileImage),
              phoneNumbers: fetched.phoneNumbers ?? [],
              savedAddresses: fetched.savedAddresses ?? [],
            }
          : null;

        return ctx.send({
          id: user.id,
          username: user.username ?? null,
          email: user.email ?? null,
          userDetails,
        });
      }

      // Create a new record
      const createData = {
        user: user.id,
        fullName: fullName ?? null,
        phoneNumbers: phoneNumbers ?? [],
        savedAddresses: savedAddresses ?? [],
      };
      if (profileImageId !== null) createData.profileImage = profileImageId;

      const created = await strapi.entityService.create("api::user-detail.user-detail", {
        data: createData,
      });

      const fetched = await strapi.db.query("api::user-detail.user-detail").findOne({
        where: { id: created.id },
        populate: { profileImage: true, phoneNumbers: true, savedAddresses: true },
      });

      const userDetails = fetched
        ? {
            id: fetched.id,
            fullName: fetched.fullName ?? null,
            profileImage: normalizeMedia(fetched.profileImage),
            phoneNumbers: fetched.phoneNumbers ?? [],
            savedAddresses: fetched.savedAddresses ?? [],
          }
        : null;

      return ctx.send({
        id: user.id,
        username: user.username ?? null,
        email: user.email ?? null,
        userDetails,
      });
    } catch (err) {
      strapi.log.error("user-detail.upsert error", err);
      return ctx.internalServerError("Server error");
    }
  },
};