// src/api/product/controllers/custom-product.js
const { createCoreController } = require("@strapi/strapi").factories;
const {
  transformVariation,
  selectProductCardVariation,
} = require("../../../utils/product-pricing");

const buildProductCard = (product) => {
  if (!product || !Array.isArray(product.variation)) {
    return null;
  }

  if (!product.variation.length) {
    return null;
  }

  const productDiscount = Number(product.productDiscount || 0);

  const categoryDiscount = Number(product.category?.categoryDiscount || 0);

  // ------------------------------------------------------------
  // Transform all variations using product-pricing.js
  // ------------------------------------------------------------

  const variations = product.variation
    .map((variation) =>
      transformVariation(variation, productDiscount, categoryDiscount),
    )
    .filter(Boolean);

  if (!variations.length) {
    return null;
  }

  // ------------------------------------------------------------
  // Select ProductCard variation using product-pricing.js
  //
  // 1. Prefer in-stock variations
  // 2. Among them choose cheapest PACK PRICE
  // 3. If all are out of stock, choose cheapest PACK PRICE
  // ------------------------------------------------------------

  const selectedVariation = selectProductCardVariation(variations);

  if (!selectedVariation) {
    return null;
  }

  // ------------------------------------------------------------
  // Images
  // ------------------------------------------------------------

  const images =
    product.images?.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alternativeText || image.name || product.name || "",
    })) || [];

  // ------------------------------------------------------------
  // Labels
  // ------------------------------------------------------------

  const labels =
    product.labels?.map((label) => ({
      id: label.id,
      name: label.name,
    })) || [];

  // ------------------------------------------------------------
  // Final ProductCard response
  // ------------------------------------------------------------

  return {
    variations,

    selectedVariation,

    product: {
      id: product.id,

      name: product.name || "",

      slug: product.slug || "",

      productDiscount,

      categoryDiscount,

      images,

      createdAt: product.createdAt || null,

      updatedAt: product.updatedAt || null,
    },

    labels,
  };
};

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

    /* =========================================================
     FETCH PRODUCT
  ========================================================= */

    const items = await strapi.entityService.findMany("api::product.product", {
      filters: {
        slug,
      },

      populate: {
        /* ================= IMAGES ================= */

        images: {
          fields: ["url", "alternativeText"],
        },

        /* ================= CATEGORY ================= */

        category: {
          fields: ["name", "slug", "categoryDiscount"],
        },

        /* ================= VARIATIONS ================= */

        variation: true,

        /* ================= LABELS ================= */

        labels: {
          fields: ["name"],
        },

        /* ================= PRODUCT REVIEWS ================= */

        product_reviews: {
          filters: {
            isApproved: true,
          },

          fields: ["name", "feedback", "stars", "createdAt"],

          sort: {
            createdAt: "desc",
          },
        },

        content: {
          populate: {
            highlightCards: {
              populate: {
                points: true,
              },
            },
          },
        },

        faqs: {
          populate: {
            FAQ: true,
          },
        },

        /* ================= SEO ================= */

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

    /* =========================================================
     PRODUCT NOT FOUND
  ========================================================= */

    if (!items || !items.length) {
      return ctx.notFound("Product not found");
    }

    const getYouMayAlsoLike = async (product) => {
      const categoryId = product.category?.id;

      if (!categoryId) {
        return [];
      }

      // ------------------------------------------------------------
      // 1. Get products from the SAME CATEGORY
      // ------------------------------------------------------------

      const sameCategoryProducts = await strapi.entityService.findMany(
        "api::product.product",
        {
          filters: {
            category: {
              id: categoryId,
            },

            // Never recommend the currently opened product
            id: {
              $ne: product.id,
            },
          },

          populate: {
            images: {
              fields: ["url", "alternativeText", "name"],
            },

            category: {
              fields: ["id", "name", "slug", "categoryDiscount"],
            },

            variation: true,

            labels: {
              fields: ["name"],
            },
          },

          publicationState: "live",

          limit: 100,
        },
      );

      // ------------------------------------------------------------
      // 2. Transform same-category products
      // ------------------------------------------------------------

      const sameCategoryRecommendations = sameCategoryProducts
        .map(buildProductCard)
        .filter(Boolean);

      // ------------------------------------------------------------
      // 3. If we already have 4, return only 4
      // ------------------------------------------------------------

      if (sameCategoryRecommendations.length >= 4) {
        return sameCategoryRecommendations.slice(0, 4);
      }

      // ------------------------------------------------------------
      // 4. We need more products.
      //
      //    Fetch products from OTHER categories.
      // ------------------------------------------------------------

      const requiredProducts = 4 - sameCategoryRecommendations.length;

      const otherProducts = await strapi.entityService.findMany(
        "api::product.product",
        {
          filters: {
            id: {
              $ne: product.id,
            },

            category: {
              id: {
                $ne: categoryId,
              },
            },
          },

          populate: {
            images: {
              fields: ["url", "alternativeText", "name"],
            },

            category: {
              fields: ["id", "name", "slug", "categoryDiscount"],
            },

            variation: true,

            labels: {
              fields: ["name"],
            },
          },

          publicationState: "live",

          limit: 100,
        },
      );

      // ------------------------------------------------------------
      // 5. Randomise other-category products
      // ------------------------------------------------------------

      const shuffledOtherProducts = [...otherProducts].sort(
        () => Math.random() - 0.5,
      );

      // ------------------------------------------------------------
      // 6. Transform them using the SAME ProductCard logic
      // ------------------------------------------------------------

      const additionalRecommendations = shuffledOtherProducts
        .map(buildProductCard)
        .filter(Boolean)
        .slice(0, requiredProducts);

      // ------------------------------------------------------------
      // 7. Final result
      // ------------------------------------------------------------

      return [
        ...sameCategoryRecommendations,
        ...additionalRecommendations,
      ].slice(0, 4);
    };

    const prod = items[0];
    const youMayAlsoLike = await getYouMayAlsoLike(prod);
    const faqs = prod.faqs
      ? {
          mainHeading: prod.faqs.mainHeading || "",
          subHeading: prod.faqs.subHeading || "",

          items: Array.isArray(prod.faqs.FAQ)
            ? [...prod.faqs.FAQ]
                .sort(
                  (a, b) =>
                    Number(a.sort_order || 0) - Number(b.sort_order || 0),
                )
                .map((faq) => ({
                  question: faq.question || "",
                  answer: faq.answer || "",
                  sort_order: Number(faq.sort_order || 0),
                }))
            : [],
        }
      : null;

    /* =========================================================
     DISCOUNTS
  ========================================================= */

    const productDiscount = Number(prod.productDiscount || 0);

    const categoryDiscount = Number(prod.category?.categoryDiscount || 0);

    /* =========================================================
     NORMALIZE ALL VARIATIONS
     
     Pricing comes from product-pricing.js

     Price    = Pack Price stored in Strapi
     Per m²   = Pack Price / Pack Size
     Discount = Product discount > Category discount
  ========================================================= */

    const variations = (prod.variation || [])
      .map((variation) =>
        transformVariation(variation, productDiscount, categoryDiscount),
      )
      .filter(Boolean);

    /* =========================================================
     SELECT TOP PRODUCT PRICE
     
     IMPORTANT:

     For the product page, the top "From £X /m²"
     is based on the CHEAPEST PER-M² PRICE.

     Stock does NOT affect this selection.
  ========================================================= */

    const selectedVariation =
      variations.length > 0
        ? [...variations].sort(
            (a, b) =>
              Number(a?.pricing?.perM2?.selling || 0) -
              Number(b?.pricing?.perM2?.selling || 0),
          )[0]
        : null;

    /* =========================================================
     SORT AVAILABLE VARIATIONS
     
     Variation cards are displayed from:
     
     LOWEST PACK PRICE
             ↓
     HIGHEST PACK PRICE
  ========================================================= */

    const sortedVariations = [...variations].sort(
      (a, b) =>
        Number(a?.pricing?.pack?.selling || 0) -
        Number(b?.pricing?.pack?.selling || 0),
    );

    /* =========================================================
     PRICE BEFORE DISCOUNT
     
     Kept for compatibility with existing frontend code.
     
     Uses the selected variation's original pricing.
  ========================================================= */

    const priceBeforeDiscount = selectedVariation?.pricing?.isDiscounted
      ? {
          pack: selectedVariation.pricing.pack.original,

          perM2: selectedVariation.pricing.perM2.original,
        }
      : null;

    /* =========================================================
     SEO
  ========================================================= */

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

    /* =========================================================
     FINAL RESPONSE
  ========================================================= */

    return {
      /* ================= BASIC PRODUCT DATA ================= */

      id: prod.id,

      name: prod.name,

      slug: prod.slug,

      description: prod.description,

      productDiscount: productDiscount,

      /* ================= PRODUCT CONTENT ================= */

      content: prod.content
        ? {
            introContent: prod.content.introContent || "",

            highlightCards: (prod.content.highlightCards || []).map((card) => ({
              title: card.title || "",
              icon: card.icon || "",
              points: (card.points || []).map((point) => ({
                point: point.point || "",
              })),
            })),

            closingContent: prod.content.closingContent || "",
          }
        : {},

      faqs,

      /* ================= IMAGES ================= */

      images: (prod.images || []).map((img) => ({
        url: img.url,
        alt: img.alternativeText || "",
      })),

      /* ================= ALL VARIATIONS ================= */

      variations: sortedVariations,

      /* ================= TOP / SELECTED VARIATION ================= */

      selectedVariation,

      /* ================= LABELS ================= */

      labels: (prod.labels || []).map((label) => ({
        id: label.id,
        name: label.name || "",
      })),

      /* ================= CATEGORY ================= */

      category: prod.category
        ? {
            name: prod.category.name || "",

            slug: prod.category.slug || "",

            categoryDiscount: Number(prod.category.categoryDiscount || 0),
          }
        : null,

      /* ================= PRICE BEFORE DISCOUNT ================= */

      priceBeforeDiscount,

      /* ================= PRODUCT REVIEWS ================= */

      productReviews: (prod.product_reviews || []).map((review) => ({
        name: review.name || "",

        stars: review.stars || 0,

        feedback: review.feedback || "",

        createdAt: review.createdAt
          ? new Date(review.createdAt).toISOString().split("T")[0]
          : null,
      })),

      youMayAlsoLike,

      /* ================= SEO ================= */

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
