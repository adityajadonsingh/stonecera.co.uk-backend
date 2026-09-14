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
      },
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
      },
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
      },
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
      },
    );

    const serverIds = freshUser.wishlist.map((p) => p.id);
    const merged = Array.from(new Set([...serverIds, ...items]));

    await strapi.entityService.update(
      "plugin::users-permissions.user",
      user.id,
      {
        data: { wishlist: merged },
      },
    );

    return { wishlist: merged };
  },

  async products(ctx) {
    let productIds = [];

    // ============================================================
    // GET WISHLIST PRODUCT IDS
    // ============================================================

    if (ctx.query.ids) {
      productIds = ctx.query.ids
        .split(",")
        .map((id) => Number(id))
        .filter(Boolean);
    } else if (ctx.state.user) {
      const user = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        ctx.state.user.id,
        {
          populate: {
            wishlist: {
              fields: ["id"],
            },
          },
        },
      );

      productIds = user?.wishlist?.map((p) => p.id) || [];
    }

    if (!productIds.length) {
      return [];
    }

    // ============================================================
    // FETCH PRODUCTS
    // ============================================================

    const products = await strapi.entityService.findMany(
      "api::product.product",
      {
        filters: {
          id: {
            $in: productIds,
          },
        },

        populate: {
          images: {
            fields: ["id", "url", "alternativeText"],
          },

          category: {
            fields: ["id", "name", "slug", "categoryDiscount"],
          },

          variation: true,

          labels: {
            fields: ["id", "name"],
          },
        },
      },
    );

    // ============================================================
    // PRICING HELPERS
    // ============================================================

    const {
      transformVariation,
      selectProductCardVariation,
    } = require("../../../utils/product-pricing");

    // ============================================================
    // BUILD CATEGORY PRODUCT RESPONSE
    // ============================================================

    const productsResponse = products
      .map((product) => {
        const rawVariations = Array.isArray(product.variation)
          ? product.variation
          : [];

        if (!rawVariations.length) {
          return null;
        }

        // ----------------------------------------------------------
        // DISCOUNTS
        // ----------------------------------------------------------

        const productDiscount = Number(product.productDiscount || 0);

        const categoryDiscount = Number(
          product.category?.categoryDiscount || 0,
        );

        // ----------------------------------------------------------
        // TRANSFORM ALL VARIATIONS
        // ----------------------------------------------------------

        const variations = rawVariations
          .map((variation) =>
            transformVariation(variation, productDiscount, categoryDiscount),
          )
          .filter(Boolean);

        if (!variations.length) {
          return null;
        }

        // ----------------------------------------------------------
        // SELECT CARD VARIATION
        //
        // Same logic as ProductGrid/category pages:
        // - prefer in-stock variations
        // - then cheapest PACK price
        // ----------------------------------------------------------

        const selectedVariation = selectProductCardVariation(variations);

        if (!selectedVariation) {
          return null;
        }

        // ----------------------------------------------------------
        // FINAL CATEGORY PRODUCT
        // ----------------------------------------------------------

        return {
          variations,

          selectedVariation,

          product: {
            id: product.id,
            name: product.name || "",
            slug: product.slug || "",

            description: product.description || "",

            productDiscount,

            images:
              product.images?.map((image) => ({
                id: image.id,
                url: image.url,
                alt: image.alternativeText || "",
              })) || [],

            category: product.category
              ? {
                  id: product.category.id,
                  name: product.category.name || "",
                  slug: product.category.slug || "",
                  categoryDiscount,
                }
              : null,

            labels:
              product.labels?.map((label) => ({
                id: label.id,
                name: label.name,
              })) || [],

            updatedAt: product.updatedAt || product.createdAt || "",
          },
        };
      })
      .filter(Boolean);

    // ============================================================
    // PRESERVE WISHLIST ORDER
    // ============================================================

    const productMap = new Map(
      productsResponse.map((product) => [product.product.id, product]),
    );

    return productIds.map((id) => productMap.get(id)).filter(Boolean);
  },
};
