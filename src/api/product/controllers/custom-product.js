// src/api/product/controllers/custom-product.js
const { createCoreController } = require("@strapi/strapi").factories;

async function getHomepageReviews(strapi) {
  const homepage = await strapi.entityService.findOne(
    "api::homepage.homepage",
    1,
    {
      populate: {
        customer_reviews_section: {
          populate: {
            reviews: true,
          },
        },
      },
    },
  );

  if (!homepage?.customer_reviews_section) return null;

  const rs = homepage.customer_reviews_section;

  return {
    sectionTitle: rs.sectionTitle || "",
    sectionSubtitle: rs.sectionSubtitle || "",
    reviews: (rs.reviews || [])
      .filter((r) => r.isActive === true)
      .map((r) => ({
        name: r.name || "",
        stars: r.stars || 0,
        review: r.review || "",
      })),
  };
}

module.exports = createCoreController("api::product.product", ({ strapi }) => ({
  async allProducts(ctx) {
    const products = await strapi.entityService.findMany(
      "api::product.product",
      {
        populate: { variation: true },
        limit: -1,
      },
    );

    return { products };
  },

  // GET /api/products?limit=&page=0
  async list(ctx) {
    const limit = parseInt(ctx.query.limit || "12", 10);
    const page = Math.max(parseInt(ctx.query.page || "1", 10), 1);
    const offset = (page - 1) * limit;

    const [products, totalProducts] = await Promise.all([
      strapi.entityService.findMany("api::product.product", {
        populate: {
          images: { fields: ["url", "alternativeText"] },
          category: { fields: ["name", "slug", "categoryDiscount"] },
          variation: true,
        },
        limit,
        start: offset,
        publicationState: "live",
        sort: { createdAt: "desc" },
      }),
      strapi.entityService.count("api::product.product", {
        publicationState: "live",
      }),
    ]);

    const productsResponse = products
      .map((prod) => {
        const variations = Array.isArray(prod.variation) ? prod.variation : [];
        if (!variations.length) return null;

        // Normalize variations
        const normalized = variations.map((v) => {
          const per = typeof v.Per_m2 === "number" ? v.Per_m2 : 0;
          const pack = typeof v.PackSize === "number" ? v.PackSize : 0;
          const stock = v.Stock ?? 0;
          const raw = per && pack ? per * pack : 0;

          return {
            id: v.uuid || v.id,
            Per_m2: per,
            PackSize: pack,
            Stock: stock,
            Price: Math.floor(raw),
            SKU: v.SKU,
            Finish: v.Finish,
            Thickness: v.Thickness,
            Size: v.Size,
            Pcs: v.Pcs,
            ColorTone: v.ColorTone,
          };
        });

        // Choose variation (same logic as category)
        const inStock = normalized.filter((v) => v.Stock > 0);
        const chosen =
          inStock.sort((a, b) => a.Per_m2 - b.Per_m2)[0] ||
          normalized.sort((a, b) => a.Per_m2 - b.Per_m2)[0];

        const prodDisc = prod.productDiscount ?? 0;
        const catDisc = prod.category?.categoryDiscount ?? 0;
        const usedDiscount =
          prodDisc > 0 ? prodDisc : catDisc > 0 ? catDisc : 0;

        let priceBeforeDiscount = null;
        if (usedDiscount > 0) {
          const mul = 1 + usedDiscount / 100;
          priceBeforeDiscount = {
            Per_m2: Math.floor(chosen.Per_m2 * mul),
            Price: Math.floor(chosen.Price * mul),
          };
        }

        return {
          variations: normalized,
          selectedVariation: chosen,
          priceBeforeDiscount,
          product: {
            id: prod.id,
            name: prod.name,
            slug: prod.slug,
            productDiscount: prod.productDiscount ?? 0,
            categoryDiscount: prod.category?.categoryDiscount ?? 0,
            images:
              prod.images?.map((img) => ({
                url: img.url,
                alt: img.alternativeText || "",
              })) ?? [],
            updatedAt: prod.updatedAt ?? prod.createdAt,
          },
        };
      })
      .filter(Boolean);

    return {
      totalProducts,
      products: productsResponse,
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
        product_reviews: {
          filters: { isApproved: true },
          fields: ["name", "feedback", "stars", "createdAt"],
          sort: { createdAt: "desc" },
        },
        seo: {
          populate: {
            og_image: true,
            twitter_image: true,
          },
        },
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

    const reviews = await getHomepageReviews(strapi);
    /* ================= SEO ================= */
    const seo = prod.seo
      ? {
          meta_title: prod.seo.meta_title || "",
          meta_description: prod.seo.meta_description || "",
          meta_keyword: prod.seo.meta_keyword || "",
          canonical_tag: prod.seo.canonical_tag || "",
          robots: prod.seo.robots || "",
          og_title: prod.seo.og_title || "",
          og_description: prod.seo.og_description || "",
          twitter_title: prod.seo.twitter_title || "",
          twitter_description: prod.seo.twitter_description || "",

          og_image: prod.seo.og_image ? prod.seo.og_image.url : null,

          twitter_image: prod.seo.twitter_image
            ? prod.seo.twitter_image.url
            : null,
        }
      : null;
    return {
      id: prod.id,
      name: prod.name,
      slug: prod.slug,
      description: prod.description,
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
      reviews,
      productReviews: (prod.product_reviews || []).map((r) => ({
        name: r.name,
        stars: r.stars,
        feedback: r.feedback,
        createdAt: r.createdAt
          ? new Date(r.createdAt).toISOString().split("T")[0]
          : null,
      })),
      seo,
    };
  },

  async updateVariation(ctx) {
    const { productId } = ctx.params;
    const updates = ctx.request.body;

    const product = await strapi.entityService.findOne(
      "api::product.product",
      productId,
      {
        populate: { variation: true },
      },
    );

    if (!product) {
      return ctx.notFound("Product not found");
    }

    const variations = product.variation || [];

    const updatedVariations = variations.map((v) => {
      const match = updates.find((u) => u.uuid == v.uuid);
      if (match) {
        return {
          ...v,
          SKU: match.SKU,
          Stock: Number(match.Stock),
          Price: Number(match.Price),
          Per_m2: Number(match.Per_m2),
          PackSize: Number(match.PackSize),
        };
      }
      return v;
    });

    await strapi.entityService.update("api::product.product", productId, {
      data: {
        variation: updatedVariations,
      },
    });

    return { success: true };
  },

  async syncStock(ctx) {
    const updates = ctx.request.body;

    const products = await strapi.entityService.findMany(
      "api::product.product",
      {
        populate: {
          variation: true,
        },
        limit: -1,
      },
    );

    // SKU -> Stock map
    const stockMap = new Map();

    updates.forEach((u) => {
      const sku = (u.SKU || "").trim().toUpperCase();

      if (!sku) return;

      stockMap.set(sku, Number(u.Stock) || 0);
    });

    let updatedProducts = 0;
    let updatedVariations = 0;

    for (const product of products) {
      let changed = false;

      const variations = (product.variation || []).map((v) => {
        const sku = (v.SKU || "").trim().toUpperCase();

        if (!stockMap.has(sku)) {
          return v;
        }

        const newStock = stockMap.get(sku);

        if (Number(v.Stock) !== newStock) {
          changed = true;
          updatedVariations++;

          return {
            ...v,
            Stock: newStock,
          };
        }

        return v;
      });

      if (changed) {
        await strapi.entityService.update("api::product.product", product.id, {
          data: {
            variation: variations,
          },
        });

        updatedProducts++;
      }
    }

    return {
      success: true,
      updatedProducts,
      updatedVariations,
    };
  },
}));
