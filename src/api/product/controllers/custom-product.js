// src/api/product/controllers/custom-product.js
const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::product.product", ({ strapi }) => ({
  // GET /api/products?limit=&page=
  async list(ctx) {
    const limit = parseInt(ctx.query.limit || "12", 10);
    const page = Math.max(parseInt(ctx.query.page || "1", 10), 1);
    const start = (page - 1) * limit;

    const [products, total] = await Promise.all([
      strapi.entityService.findMany("api::product.product", {
        populate: {
          images: { fields: ["url", "alternativeText"] },
          category: { fields: ["name", "slug", "categoryDiscount"] },
          variation: true,
        },
        limit,
        start,
        publicationState: "live",
      }),
      strapi.entityService.count("api::product.product", {
        publicationState: "live",
      }),
    ]);

    const data = products.map((prod) => {
      const variations = Array.isArray(prod.variation) ? prod.variation : [];

      // normalize price = Per_m2 * PackSize (2 decimals)
      const normalized = variations.map((v) => {
        const per = typeof v.Per_m2 === "number" ? v.Per_m2 : 0;
        const pack = typeof v.PackSize === "number" ? v.PackSize : 0;
        const raw = per && pack ? per * pack : 0;
        const price = Math.floor(raw);

        return {
          id: v.uuid || v.id || null,
          Per_m2: per,
          PackSize: pack,
          Price: price,
        };
      });

      // cheapest variation by Price
      const cheapest =
        normalized.length > 0
          ? normalized.reduce((min, v) => (v.Price < min.Price ? v : min))
          : null;

      // discount logic (product > category)
      const prodDisc = prod.productDiscount ?? 0;
      const catDisc = prod.category?.categoryDiscount ?? 0;
      const used = prodDisc > 0 ? prodDisc : catDisc > 0 ? catDisc : 0;

      let priceBeforeDiscount = null;
      if (used > 0 && cheapest) {
        const mul = 1 + used / 100;
        priceBeforeDiscount = {
          Per_m2: Math.floor(cheapest.Per_m2 * mul),
          Price: Math.floor(cheapest.Price * mul),
        };
      }

      return {
        id: prod.id,
        name: prod.name,
        slug: prod.slug,
        productDiscount: prod.productDiscount ?? 0,
        images: prod.images?.length
          ? [{ url: prod.images[0].url, alt: prod.images[0].alternativeText }]
          : [],
        variation: cheapest
          ? { Price: cheapest.Price, PackSize: cheapest.PackSize }
          : null,
        category: prod.category
          ? {
              name: prod.category.name,
              slug: prod.category.slug,
              categoryDiscount: prod.category.categoryDiscount ?? 0,
            }
          : null,
        priceBeforeDiscount,
      };
    });

    return {
      meta: {
        page,
        pageSize: limit,
        total,
        pageCount: Math.ceil(total / limit),
      },
      data,
    };
  },

  // GET /api/product/:slug
  async detail(ctx) {
    const { slug } = ctx.params;

    const items = await strapi.entityService.findMany("api::product.product", {
      filters: { slug },
      populate: {
        images: { fields: ["url", "alternativeText"] },
        category: { fields: ["name", "slug", "categoryDiscount"] },
        variation: true,
      },
      publicationState: "live",
      limit: 1,
    });

    if (!items || !items.length) {
      return ctx.notFound("Product not found");
    }

    const prod = items[0];

    // normalize every variation (compute Price)
    const variations = (prod.variation || []).map((v) => {
      const per = typeof v.Per_m2 === "number" ? v.Per_m2 : 0;
      const pack = typeof v.PackSize === "number" ? v.PackSize : 0;
      const raw = per && pack ? per * pack : 0;
      const price = Math.floor(raw);
      return {
        id: v.uuid || v.id || null,
        SKU: v.SKU,
        Per_m2: per,
        PackSize: pack,
        Pcs: v.Pcs ?? 0,
        Stock: v.Stock ?? 0,
        ColorTone: v.ColorTone,
        Finish: v.Finish,
        Thickness: v.Thickness,
        Size: v.Size,
        Price: price,
      };
    });

    // compute priceBeforeDiscount from cheapest
    const cheapest =
      variations.length > 0
        ? variations.reduce((min, v) => (v.Price < min.Price ? v : min))
        : null;

    const prodDisc = prod.productDiscount ?? 0;
    const catDisc = prod.category?.categoryDiscount ?? 0;
    const used = prodDisc > 0 ? prodDisc : catDisc > 0 ? catDisc : 0;

    let priceBeforeDiscount = null;
    if (used > 0 && cheapest) {
      const mul = 1 + used / 100;
      priceBeforeDiscount = {
        Per_m2: Math.floor(cheapest.Per_m2 * mul),
        Price: Math.floor(cheapest.Price * mul),
      };
    }

    return {
      id: prod.id,
      name: prod.name,
      slug: prod.slug,
      productDiscount: prod.productDiscount ?? 0,
      images:
        (prod.images || []).map((img) => ({
          url: img.url,
          alt: img.alternativeText,
        })) ?? [],
      variations,
      category: prod.category
        ? {
            name: prod.category.name,
            slug: prod.category.slug,
            categoryDiscount: prod.category.categoryDiscount ?? 0,
          }
        : null,
      priceBeforeDiscount,
    };
  },
}));
