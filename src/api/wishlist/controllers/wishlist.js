// api/wishlist/controllers/wishlist.js
"use strict";

module.exports = {
  async get(ctx) {
    const user = ctx.state.user;

    const freshUser = await strapi.entityService.findOne(
      "plugin::users-permissions.user",
      user.id,
      {
        populate: { wishlist: { fields: ["id"] } },
      }
    );

    return {
      data: freshUser.wishlist.map((p) => p.id),
    };
  },

  async toggle(ctx) {
    const user = ctx.state.user;
    const { productId } = ctx.request.body;

    if (!productId) {
      return ctx.badRequest("productId required");
    }

    const freshUser = await strapi.entityService.findOne(
      "plugin::users-permissions.user",
      user.id,
      {
        populate: { wishlist: { fields: ["id"] } },
      }
    );

    const wishlistIds = freshUser.wishlist.map((p) => p.id);

    const updated = wishlistIds.includes(productId)
      ? wishlistIds.filter((id) => id !== productId)
      : [...wishlistIds, productId];

    await strapi.entityService.update(
      "plugin::users-permissions.user",
      user.id,
      {
        data: {
          wishlist: updated, // ✅ PRODUCT IDS NOW
        },
      }
    );

    return { wishlist: updated };
  },

  async merge(ctx) {
    const user = ctx.state.user;
    const { items } = ctx.request.body;

    if (!Array.isArray(items)) {
      return ctx.badRequest("items must be array");
    }

    const freshUser = await strapi.entityService.findOne(
      "plugin::users-permissions.user",
      user.id,
      {
        populate: { wishlist: { fields: ["id"] } },
      }
    );

    const serverIds = freshUser.wishlist.map((p) => p.id);
    const merged = Array.from(new Set([...serverIds, ...items]));

    await strapi.entityService.update(
      "plugin::users-permissions.user",
      user.id,
      {
        data: { wishlist: merged },
      }
    );

    return { wishlist: merged };
  },

  async products(ctx) {
    let productIds = [];

    // 1️⃣ If ids are explicitly provided → ALWAYS use them (guest case)
    if (ctx.query.ids) {
      productIds = ctx.query.ids
        .split(",")
        .map((id) => Number(id))
        .filter(Boolean);
    }

    // 2️⃣ Else, if logged-in → use DB wishlist
    else if (ctx.state.user) {
      const user = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        ctx.state.user.id,
        {
          populate: { wishlist: { fields: ["id"] } },
        }
      );

      productIds = user?.wishlist?.map((p) => p.id) || [];
    }

    // 3️⃣ Nothing to return
    if (!productIds.length) {
      return [];
    }

    const products = await strapi.entityService.findMany(
      "api::product.product",
      {
        filters: { id: { $in: productIds } },
        populate: {
          images: { fields: ["url", "alternativeText"] },
          category: { fields: ["name", "slug"] },
        },
      }
    );

    // ✅ RETURN ARRAY DIRECTLY
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      image: p.images?.[0]
        ? {
            url: p.images[0].url,
            alt: p.images[0].alternativeText || p.name,
          }
        : null,
      category: p.category
        ? {
            name: p.category.name,
            slug: p.category.slug,
          }
        : null,
    }));
  },
};
