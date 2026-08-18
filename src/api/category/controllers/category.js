const { createCoreController } = require("@strapi/strapi").factories;
const {
  transformVariation,
  selectProductCardVariation,
} = require("../../../utils/product-pricing");

const ENUMS = {
  thickness: [
    "THICKNESS 12-20MM",
    "THICKNESS 15-25MM",
    "THICKNESS 18MM",
    "THICKNESS 20MM",
    "THICKNESS 22MM",
    "THICKNESS 25-35MM",
    "THICKNESS 25-45MM",
    "THICKNESS 30-40MM",
    "THICKNESS 35-50MM",
    "THICKNESS 35-55MM",
    "THICKNESS 68MM",
  ],
  size: [
    "SIZE 100X100",
    "SIZE 100X200",
    "SIZE 150X900",
    "SIZE 200X600",
    "SIZE 228X110",
    "SIZE 600X1200",
    "SIZE 600X150",
    "SIZE 600X600",
    "SIZE 600X900",
    "Mix Pack",
  ],
  colorTone: [
    "Beige",
    "Black",
    "Blue",
    "Bronze",
    "Brown",
    "Cream",
    "Golden",
    "Green",
    "Grey",
    "Mint",
    "Multi",
    "Red",
    "Silver",
    "White",
    "Yellow",
  ],
};

module.exports = createCoreController(
  "api::category.category",
  ({ strapi }) => ({
    // ----------------------------------------------------------------
    async customList(ctx) {
      const categoriesRaw = await strapi.db
        .query("api::category.category")
        .findMany({
          select: [
            "name",
            "slug",
            "categoryDiscount",
            "updatedAt",
            "createdAt",
          ],
          populate: {
            images: { select: ["id", "url", "alternativeText"] },
          },
        });

      // 🔹 Deduplicate by slug
      const uniqueCategories = [];
      const seen = new Set();

      for (const cat of categoriesRaw) {
        if (!seen.has(cat.slug)) {
          seen.add(cat.slug);
          uniqueCategories.push({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            categoryDiscount: cat.categoryDiscount,
            images: cat.images
              ? cat.images.map((img) => ({
                  id: img.id,
                  url: img.url,
                  alt: img.alternativeText,
                }))
              : [],
            updatedAt: cat.updatedAt,
          });
        }
      }

      return uniqueCategories;
    },

    // ----------------------------------------------------------------
    async customDetail(ctx) {
      const { slug } = ctx.params;

      const { price, colorTone, finish, thickness, size, pcs, packSize } =
        ctx.query;

      // ------------------------------------------------------------
      // Helpers
      // ------------------------------------------------------------

      const toNumber = (value) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : 0;
      };

      const parseMultiValue = (value) => {
        if (!value) return [];

        if (Array.isArray(value)) {
          return value
            .flatMap((item) => String(item).split(","))
            .map((item) => item.trim())
            .filter(Boolean);
        }

        return String(value)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      };

      const matchesMultiFilter = (value, selectedValues) => {
        if (!selectedValues.length) return true;

        return selectedValues.includes(value);
      };

      // ------------------------------------------------------------
      // Parse filters
      // ------------------------------------------------------------

      const selectedColorTones = parseMultiValue(colorTone);
      const selectedFinishes = parseMultiValue(finish);
      const selectedThicknesses = parseMultiValue(thickness);
      const selectedSizes = parseMultiValue(size);
      const selectedPcs = parseMultiValue(pcs);
      const selectedPackSizes = parseMultiValue(packSize);

      let priceFilter = null;

      if (price) {
        const [min, max] = String(price).split("-").map(Number);

        if (Number.isFinite(min) && Number.isFinite(max)) {
          priceFilter = {
            min,
            max,
          };
        }
      }

      // ------------------------------------------------------------
      // Fetch category with products + variations
      // ------------------------------------------------------------

      const category = await strapi.db.query("api::category.category").findOne({
        where: {
          slug,
        },

        populate: {
          bannerImg: {
            select: ["id", "url", "alternativeText"],
          },

          images: {
            select: ["id", "url", "alternativeText"],
          },

          products: {
            select: [
              "name",
              "slug",
              "createdAt",
              "updatedAt",
              "productDiscount",
            ],

            populate: {
              images: {
                select: ["id", "url", "alternativeText"],
              },

              variation: true,
            },
          },

          seo: {
            populate: {
              og_image: true,
              twitter_image: true,
            },
          },
        },
      });

      if (!category) {
        return ctx.notFound("Category not found");
      }

      // ------------------------------------------------------------
      // Get all variations
      //
      // Keep the original Strapi variation data here because
      // filtering works against the raw variation fields.
      // Pricing itself is handled later by product-pricing.js.
      // ------------------------------------------------------------

      const allVariations = category.products.flatMap(
        (product) => product.variation || [],
      );

      // ------------------------------------------------------------
      // Dynamic pack-price range
      //
      // Price = PACK PRICE stored in Strapi.
      // We intentionally do NOT use Per_m2 for filtering.
      // ------------------------------------------------------------

      const allPrices = allVariations
        .map((variation) => toNumber(variation.Price))
        .filter((value) => value > 0);

      const minPrice = allPrices.length ? Math.min(...allPrices) : 0;

      const maxPrice = allPrices.length ? Math.max(...allPrices) : 0;

      // ------------------------------------------------------------
      // Filter matching
      // ------------------------------------------------------------

      const variationMatches = (variation, activeFilters) => {
        // ---------------- PRICE ----------------

        if (
          activeFilters.price &&
          (variation.Price < activeFilters.price.min ||
            variation.Price > activeFilters.price.max)
        ) {
          return false;
        }

        // ---------------- COLOR ----------------

        if (
          activeFilters.colorTone.length &&
          !matchesMultiFilter(variation.ColorTone, activeFilters.colorTone)
        ) {
          return false;
        }

        // ---------------- FINISH ----------------

        if (
          activeFilters.finish.length &&
          !matchesMultiFilter(variation.Finish, activeFilters.finish)
        ) {
          return false;
        }

        // ---------------- THICKNESS ----------------

        if (
          activeFilters.thickness.length &&
          !matchesMultiFilter(variation.Thickness, activeFilters.thickness)
        ) {
          return false;
        }

        // ---------------- SIZE ----------------

        if (
          activeFilters.size.length &&
          !matchesMultiFilter(variation.Size, activeFilters.size)
        ) {
          return false;
        }

        // ---------------- PCS ----------------

        if (
          activeFilters.pcs.length &&
          !activeFilters.pcs.includes(String(variation.Pcs))
        ) {
          return false;
        }

        // ---------------- PACK SIZE ----------------

        if (
          activeFilters.packSize.length &&
          !activeFilters.packSize.includes(String(variation.PackSize))
        ) {
          return false;
        }

        return true;
      };

      // ------------------------------------------------------------
      // Active filters
      // ------------------------------------------------------------

      const activeFilters = {
        price: priceFilter,
        colorTone: selectedColorTones,
        finish: selectedFinishes,
        thickness: selectedThicknesses,
        size: selectedSizes,
        pcs: selectedPcs,
        packSize: selectedPackSizes,
      };

      // ------------------------------------------------------------
      // Filter products
      // ------------------------------------------------------------

      const getFilteredProducts = (filtersToUse) => {
        return category.products
          .map((product) => {
            const filteredVariations = (product.variation || []).filter(
              (variation) => variationMatches(variation, filtersToUse),
            );

            return {
              ...product,
              variation: filteredVariations,
            };
          })
          .filter((product) => product.variation.length > 0);
      };

      const filteredProducts = getFilteredProducts(activeFilters);

      // ------------------------------------------------------------
      // Filter counts
      //
      // Each filter ignores itself when calculating its counts.
      // This allows multiple filters to work together.
      // ------------------------------------------------------------

      const createFiltersWithout = (filterName) => ({
        price: filterName === "price" ? null : activeFilters.price,

        colorTone: filterName === "colorTone" ? [] : activeFilters.colorTone,

        finish: filterName === "finish" ? [] : activeFilters.finish,

        thickness: filterName === "thickness" ? [] : activeFilters.thickness,

        size: filterName === "size" ? [] : activeFilters.size,

        pcs: filterName === "pcs" ? [] : activeFilters.pcs,

        packSize: filterName === "packSize" ? [] : activeFilters.packSize,
      });

      const computeVisibleVariations = (excludeFilter) => {
        const products = getFilteredProducts(
          createFiltersWithout(excludeFilter),
        );

        return products.flatMap((product) => product.variation || []);
      };

      // ------------------------------------------------------------
      // Base filter counts
      // ------------------------------------------------------------

      const filterCounts = {
        price: {
          min: minPrice,
          max: maxPrice,
        },

        colorTone: Object.fromEntries(
          ENUMS.colorTone.map((option) => [option, 0]),
        ),

        finish: {},

        thickness: Object.fromEntries(
          ENUMS.thickness.map((option) => [option, 0]),
        ),

        size: Object.fromEntries(ENUMS.size.map((option) => [option, 0])),

        pcs: {},

        packSize: {},
      };

      // ------------------------------------------------------------
      // Color Tone counts
      // ------------------------------------------------------------

      computeVisibleVariations("colorTone").forEach((variation) => {
        if (
          variation.ColorTone &&
          filterCounts.colorTone[variation.ColorTone] !== undefined
        ) {
          filterCounts.colorTone[variation.ColorTone] += 1;
        }
      });

      // ------------------------------------------------------------
      // Finish counts
      // ------------------------------------------------------------

      computeVisibleVariations("finish").forEach((variation) => {
        if (variation.Finish) {
          filterCounts.finish[variation.Finish] =
            (filterCounts.finish[variation.Finish] || 0) + 1;
        }
      });

      // ------------------------------------------------------------
      // Thickness counts
      // ------------------------------------------------------------

      computeVisibleVariations("thickness").forEach((variation) => {
        if (
          variation.Thickness &&
          filterCounts.thickness[variation.Thickness] !== undefined
        ) {
          filterCounts.thickness[variation.Thickness] += 1;
        }
      });

      // ------------------------------------------------------------
      // Size counts
      // ------------------------------------------------------------

      computeVisibleVariations("size").forEach((variation) => {
        if (variation.Size && filterCounts.size[variation.Size] !== undefined) {
          filterCounts.size[variation.Size] += 1;
        }
      });

      // ------------------------------------------------------------
      // Pcs counts
      // ------------------------------------------------------------

      computeVisibleVariations("pcs").forEach((variation) => {
        if (variation.Pcs) {
          const key = String(variation.Pcs);

          filterCounts.pcs[key] = (filterCounts.pcs[key] || 0) + 1;
        }
      });

      // ------------------------------------------------------------
      // Pack Size counts
      // ------------------------------------------------------------

      computeVisibleVariations("packSize").forEach((variation) => {
        if (variation.PackSize) {
          const key = String(variation.PackSize);

          filterCounts.packSize[key] = (filterCounts.packSize[key] || 0) + 1;
        }
      });

      // ------------------------------------------------------------
      // Pagination
      // ------------------------------------------------------------

      const start = parseInt(ctx.query.offset || "0", 10);

      const limit = parseInt(ctx.query.limit || "12", 10);

      const paginatedProducts = filteredProducts.slice(start, start + limit);

      // ------------------------------------------------------------
      // Product response
      //
      // Pricing is now handled entirely by
      // product-pricing.js
      // ------------------------------------------------------------

      const productsResponse = paginatedProducts
        .map((product) => {
          const variations = product.variation || [];

          if (!variations.length) {
            return null;
          }

          const productDiscount = toNumber(product.productDiscount);

          const categoryDiscount = toNumber(category.categoryDiscount);

          // ------------------------------------------------------
          // Transform every variation
          // ------------------------------------------------------

          const transformedVariations = variations
            .map((variation) =>
              transformVariation(variation, productDiscount, categoryDiscount),
            )
            .filter(Boolean);

          if (!transformedVariations.length) {
            return null;
          }

          // ------------------------------------------------------
          // Select variation for Product Card
          //
          // selectProductCardVariation:
          //
          // 1. Prefer in-stock variations
          // 2. Among them choose cheapest per m²
          // 3. If all are out of stock, choose cheapest per m²
          // ------------------------------------------------------

          const selectedVariation = selectProductCardVariation(
            transformedVariations,
          );

          if (!selectedVariation) {
            return null;
          }

          // ------------------------------------------------------
          // Product images
          // ------------------------------------------------------

          const images =
            product.images?.map((image) => ({
              id: image.id,
              url: image.url,
              alt: image.alternativeText || image.name || product.name,
            })) || [];

          // ------------------------------------------------------
          // Final product card response
          // ------------------------------------------------------

          return {
            variations: transformedVariations,

            selectedVariation,

            product: {
              id: product.id,

              name: product.name || "",

              slug: product.slug || "",

              productDiscount,

              categoryDiscount,

              images,

              createdAt: product.createdAt,

              updatedAt: product.updatedAt,
            },
          };
        })
        .filter(Boolean);

      // ------------------------------------------------------------
      // SEO
      // ------------------------------------------------------------

      const seo = category.seo
        ? {
            meta_title: category.seo.meta_title || "",

            meta_description: category.seo.meta_description || "",

            meta_keyword: category.seo.meta_keyword || "",

            canonical_tag: category.seo.canonical_tag || "",

            robots: category.seo.robots || "",

            og_title: category.seo.og_title || "",

            og_description: category.seo.og_description || "",

            twitter_title: category.seo.twitter_title || "",

            twitter_description: category.seo.twitter_description || "",

            og_image: category.seo.og_image ? category.seo.og_image.url : null,

            twitter_image: category.seo.twitter_image
              ? category.seo.twitter_image.url
              : null,
          }
        : null;

      // ------------------------------------------------------------
      // Final response
      // ------------------------------------------------------------

      return {
        id: category.id,

        name: category.name,

        slug: category.slug,

        bannerImg: category.bannerImg,

        footerContent: category.footer_content,

        categoryDiscount: category.categoryDiscount,

        short_description: category.short_description,

        images:
          category.images?.map((image) => ({
            id: image.id,
            url: image.url,
            alt: image.alternativeText,
          })) || [],

        totalProducts: filteredProducts.length,

        products: productsResponse,

        filterCounts,

        seo,
      };
    },
  }),
);
