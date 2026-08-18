"use strict";

const {
  transformVariation,
  selectProductCardVariation,
} = require("../../../utils/product-pricing");

module.exports = {
  async find(ctx) {
    const entry = await strapi.entityService.findOne(
      "api::homepage.homepage",
      1,
      {
        populate: {
          /* ---------- BANNER ---------- */
          banner: {
            populate: {
              bannerImage: true,
            },
          },

          /* ---- FEATURED CATEGORIES ---- */
          featured_categories_section: {
            populate: {
              categories: {
                populate: {
                  category: {
                    populate: {
                      images: true,
                    },
                  },
                },
              },
            },
          },

          /* -------- BEST SELLERS -------- */
          best_seller_section: {
            populate: {
              products: {
                populate: {
                  images: true,
                  category: true,
                  variation: true,
                },
              },
            },
          },

          /* -------- REVIEWS -------- */
          customer_reviews_section: {
            populate: {
              reviews: true,
            },
          },
          seo: {
            populate: {
              og_image: true,
              twitter_image: true,
            },
          },
        },
      },
    );

    if (!entry) return ctx.notFound("Homepage not found");

    /* ================== BANNER ================== */
    const banner = (entry.banner || []).map((b) => ({
      id: b.id,
      heading: b.heading || "",
      subHeading: b.subHeading || "",
      link: b.link || "",
      bannerImage: b.bannerImage
        ? {
            url: b.bannerImage.url,
            alt: b.bannerImage.alternativeText || "",
          }
        : null,
    }));

    /* ========== FEATURED CATEGORIES ========== */
    const fc = entry.featured_categories_section;

    const featuredCategory = fc
      ? {
          sectionTitle: fc.section_title || "",
          sectionSubtitle: fc.section_subtitle || "",

          categories: await Promise.all(
            (fc.categories || []).map(async (item) => {
              const cat = item.category;
              const firstImage = cat?.images?.[0] || null;

              let productCount = 0;
              console.log("FEATURED CATEGORY:", cat);
              if (cat?.id) {
                productCount = await strapi.db
                  .query("api::product.product")
                  .count({
                    where: {
                      category: {
                        id: cat.id,
                      },
                    },
                  });
              }

              return {
                name: cat?.name || "",
                slug: cat?.slug || "",
                images: firstImage
                  ? [
                      {
                        url: firstImage.url,
                        alt: firstImage.alternativeText || "",
                      },
                    ]
                  : null,
                sub_heading: item.sub_heading || "",
                productCount,
                categoryDiscount: cat?.categoryDiscount || 0,
              };
            }),
          ),
        }
      : null;

    /* ============= BEST SELLERS ============== */

    const bs = entry.best_seller_section;

    const bestSeller = bs
      ? {
          sectionTitle: bs.section_title || "",
          sectionSubtitle: bs.section_subtitle || "",

          products: (bs.products || [])
            .map((p) => {
              const variations = Array.isArray(p.variation) ? p.variation : [];

              if (!variations.length) {
                return null;
              }

              /*
               * Product discount has priority over
               * category discount.
               *
               * Pricing is calculated server-side
               * through the shared pricing utility.
               */
              const productDiscount = Number(p.productDiscount || 0);

              const categoryDiscount = Number(
                p.category?.categoryDiscount || 0,
              );

              /*
               * Transform every variation.
               *
               * This gives every variation the same
               * structure used by the category product cards
               * and VariationPopup.
               */
              const transformedVariations = variations
                .map((variation) =>
                  transformVariation(
                    variation,
                    productDiscount,
                    categoryDiscount,
                  ),
                )
                .filter(Boolean);

              if (!transformedVariations.length) {
                return null;
              }

              /*
               * Select the variation shown on the product card.
               *
               * Priority:
               * 1. In-stock variations
               * 2. Lowest per-m² selling price
               *
               * If nothing is in stock, the lowest-priced
               * variation is selected.
               */
              const selectedVariation = selectProductCardVariation(
                transformedVariations,
              );

              if (!selectedVariation) {
                return null;
              }

              /*
               * Product card image.
               *
               * Only URL + alt are sent to the frontend.
               */
              const image = p.images?.[0] || null;

              return {
                product: {
                  id: p.id,
                  name: p.name || "",
                  slug: p.slug || "",

                  images: image
                    ? [
                        {
                          url: image.url,
                          alt: image.alternativeText || p.name || "",
                        },
                      ]
                    : [],
                },

                selectedVariation,

                variations: transformedVariations,
              };
            })
            .filter(Boolean),
        }
      : null;

    /* ================ REVIEWS ================= */
    const rs = entry.customer_reviews_section;

    const reviews = rs
      ? {
          sectionTitle: rs.sectionTitle || "",
          sectionSubtitle: rs.sectionSubtitle || "",
          reviews: (rs.reviews || [])
            .filter((r) => r.isActive === true)
            .map((r) => ({
              name: r.name || "",
              stars: r.stars || 0,
              review: r.review || "",
            })),
        }
      : null;

    /* ================= BLOGS ================= */
    const blogsData = await strapi.entityService.findMany("api::blog.blog", {
      populate: {
        cover_image: true,
      },
      sort: { createdAt: "desc" },
      limit: 3,
      publicationState: "live",
    });

    const blogs = (blogsData || []).map((b) => ({
      id: b.id,
      title: b.title || "",
      slug: b.slug,
      shortDescription: b.short_description || "",
      author: b.author_name || "",
      createdOn: b.createdAt
        ? new Date(b.createdAt).toISOString().split("T")[0]
        : null,
      image: b.cover_image
        ? {
            url: b.cover_image.url,
            alt: b.cover_image.alternativeText || "",
          }
        : null,
    }));

    /* ================= SEO ================= */
    const seo = entry.seo
      ? {
          meta_title: entry.seo.meta_title || "",
          meta_description: entry.seo.meta_description || "",
          meta_keyword: entry.seo.meta_keyword || "",
          canonical_tag: entry.seo.canonical_tag || "",
          robots: entry.seo.robots || "",
          og_title: entry.seo.og_title || "",
          og_description: entry.seo.og_description || "",
          twitter_title: entry.seo.twitter_title || "",
          twitter_description: entry.seo.twitter_description || "",

          og_image: entry.seo.og_image ? entry.seo.og_image.url : null,

          twitter_image: entry.seo.twitter_image
            ? entry.seo.twitter_image.url
            : null,
        }
      : null;

    /* ============ FINAL RESPONSE ============= */
    return {
      banner,
      featuredCategory,
      bestSeller,
      reviews,
      blogs,
      seo,
    };
  },
};
