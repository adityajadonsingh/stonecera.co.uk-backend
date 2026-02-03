"use strict";

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
          categories: (fc.categories || []).map((item) => {
            const cat = item.category;
            const firstImage = cat?.images?.[0] || null;

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
              startingFrom: item.startingFrom || "",
            };
          }),
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

              const normalized = variations.map((v) => {
                const per = v.Per_m2 || 0;
                const pack = v.PackSize || 0;
                const stock = v.Stock || 0;
                const price = per && pack ? Number((per * pack).toFixed(2)) : 0;

                return {
                  Per_m2: per,
                  Price: price,
                  Stock: stock,
                };
              });

              if (!normalized.length) return null;

              const sorted = [...normalized].sort((a, b) => a.Price - b.Price);

              const selected = sorted.find((v) => v.Stock > 0) || sorted[0];

              const productDisc = p.productDiscount || 0;
              const categoryDisc = p.category?.categoryDiscount || 0;

              const discountPercent =
                productDisc > 0
                  ? productDisc
                  : categoryDisc > 0
                    ? categoryDisc
                    : 0;

              const priceAfterDiscount = {
                Per_m2: selected.Per_m2,
                Price: selected.Price,
              };

              let priceBeforeDiscount = null;

              if (discountPercent > 0) {
                const mul = 1 + discountPercent / 100;
                priceBeforeDiscount = {
                  Per_m2: Number((selected.Per_m2 * mul).toFixed(2)),
                  Price: Number((selected.Price * mul).toFixed(2)),
                };
              }

              const img = p.images?.[0];

              return {
                name: p.name || "",
                slug: p.slug || "",
                productDiscount: p.productDiscount || 0,
                image: img
                  ? {
                      url: img.url,
                      alt: img.alternativeText || "",
                    }
                  : null,
                priceAfterDiscount,
                priceBeforeDiscount,
                category: p.category
                  ? {
                      name: p.category.name || "",
                      slug: p.category.slug || "",
                      categoryDiscount: p.category.categoryDiscount || 0,
                    }
                  : null,
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
