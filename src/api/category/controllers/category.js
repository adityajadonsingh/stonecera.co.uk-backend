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

    async customDetail(ctx) {
      const { slug } = ctx.params;

      const { price, colorTone, finish, thickness, size, pcs, packSize } =
        ctx.query;

      // ============================================================
      // HELPERS
      // ============================================================

      const toNumber = (value) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : 0;
      };

      /**
       * Supports:
       *
       * ?colorTone=Beige,Grey
       *
       * and also:
       *
       * ?colorTone=Beige&colorTone=Grey
       */
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

      /**
       * OR logic inside one filter.
       *
       * Example:
       * colorTone = [Beige, Grey]
       *
       * Variation must be Beige OR Grey.
       */
      const matchesMultiFilter = (value, selectedValues) => {
        if (!selectedValues.length) return true;

        return selectedValues.includes(String(value));
      };

      // ============================================================
      // PARSE MULTI-SELECT FILTERS
      // ============================================================

      const selectedColorTones = parseMultiValue(colorTone);
      const selectedFinishes = parseMultiValue(finish);
      const selectedThicknesses = parseMultiValue(thickness);
      const selectedSizes = parseMultiValue(size);
      const selectedPcs = parseMultiValue(pcs);
      const selectedPackSizes = parseMultiValue(packSize);

      // ============================================================
      // PRICE RANGE
      //
      // Price = PACK PRICE from variation.Price
      //
      // Expected frontend URL:
      //
      // ?price=100-500
      //
      // This is NOT Per_m2.
      // ============================================================

      let priceFilter = null;

      if (price !== undefined && price !== null && price !== "") {
        const priceValue = Number(price);

        if (Number.isFinite(priceValue)) {
          priceFilter = {
            min: 0,
            max: priceValue,
          };
        }
      }

      // ============================================================
      // FETCH CATEGORY
      // ============================================================

      const category = await strapi.db.query("api::category.category").findOne({
        where: {
          slug,
        },

        populate: {
          // --------------------------------------------------------
          // CATEGORY BANNER
          // --------------------------------------------------------
          bannerImg: {
            select: ["id", "url", "alternativeText"],
          },

          // --------------------------------------------------------
          // CATEGORY IMAGES
          // --------------------------------------------------------
          images: {
            select: ["id", "url", "alternativeText"],
          },

          // --------------------------------------------------------
          // PRODUCTS
          // --------------------------------------------------------
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
                select: ["id", "url", "alternativeText", "name"],
              },

              variation: true,
            },
          },

          // --------------------------------------------------------
          // SEO
          // --------------------------------------------------------
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

      // ============================================================
      // CATEGORY PRODUCTS
      // ============================================================

      const categoryProducts = Array.isArray(category.products)
        ? category.products
        : [];

      /**
       * IMPORTANT:
       *
       * productCount = actual number of products in category.
       *
       * A product with 10 variations still counts as ONE product.
       */
      const productCount = categoryProducts.length;

      // ============================================================
      // ALL VARIATIONS
      // ============================================================

      const allVariations = categoryProducts.flatMap((product) =>
        Array.isArray(product.variation) ? product.variation : [],
      );

      // ============================================================
      // DYNAMIC PACK PRICE RANGE
      //
      // Uses variation.Price.
      //
      // We intentionally DO NOT use Per_m2.
      //
      // This range is calculated from ALL variations in the category,
      // before filters are applied.
      // ============================================================

      const allPrices = allVariations
        .map((variation) => toNumber(variation.Price))
        .filter((value) => value > 0);

      const minPrice = allPrices.length ? Math.min(...allPrices) : 0;

      const maxPrice = allPrices.length ? Math.max(...allPrices) : 0;

      // ============================================================
      // VARIATION MATCHING
      //
      // Different filters = AND
      // Same filter = OR
      // ============================================================

      const variationMatches = (variation, activeFilters) => {
        // ----------------------------------------------------------
        // PRICE
        // ----------------------------------------------------------

        if (activeFilters.price) {
          const variationPrice = toNumber(variation.Price);

          if (
            variationPrice < activeFilters.price.min ||
            variationPrice > activeFilters.price.max
          ) {
            return false;
          }
        }

        // ----------------------------------------------------------
        // COLOR TONE
        // ----------------------------------------------------------

        if (
          activeFilters.colorTone.length &&
          !matchesMultiFilter(variation.ColorTone, activeFilters.colorTone)
        ) {
          return false;
        }

        // ----------------------------------------------------------
        // FINISH
        // ----------------------------------------------------------

        if (
          activeFilters.finish.length &&
          !matchesMultiFilter(variation.Finish, activeFilters.finish)
        ) {
          return false;
        }

        // ----------------------------------------------------------
        // THICKNESS
        //
        // IMPORTANT:
        //
        // DB value:
        // "THICKNESS 20MM"
        //
        // We compare against the RAW enum value.
        // ----------------------------------------------------------

        if (
          activeFilters.thickness.length &&
          !matchesMultiFilter(variation.Thickness, activeFilters.thickness)
        ) {
          return false;
        }

        // ----------------------------------------------------------
        // SIZE
        //
        // IMPORTANT:
        //
        // DB value:
        // "SIZE 600X900"
        //
        // We compare against the RAW enum value.
        // ----------------------------------------------------------

        if (
          activeFilters.size.length &&
          !matchesMultiFilter(variation.Size, activeFilters.size)
        ) {
          return false;
        }

        // ----------------------------------------------------------
        // PCS
        // ----------------------------------------------------------

        if (
          activeFilters.pcs.length &&
          !activeFilters.pcs.includes(String(variation.Pcs))
        ) {
          return false;
        }

        // ----------------------------------------------------------
        // PACK SIZE
        // ----------------------------------------------------------

        if (
          activeFilters.packSize.length &&
          !activeFilters.packSize.includes(String(variation.PackSize))
        ) {
          return false;
        }

        return true;
      };

      // ============================================================
      // ACTIVE FILTERS
      // ============================================================

      const activeFilters = {
        price: priceFilter,
        colorTone: selectedColorTones,
        finish: selectedFinishes,
        thickness: selectedThicknesses,
        size: selectedSizes,
        pcs: selectedPcs,
        packSize: selectedPackSizes,
      };

      // ============================================================
      // FILTER PRODUCTS
      //
      // A product remains visible when AT LEAST ONE of its
      // variations matches all active filters.
      // ============================================================

      const getFilteredProducts = (filtersToUse) => {
        return categoryProducts
          .map((product) => {
            const variations = Array.isArray(product.variation)
              ? product.variation
              : [];

            const filteredVariations = variations.filter((variation) =>
              variationMatches(variation, filtersToUse),
            );

            return {
              ...product,
              variation: filteredVariations,
            };
          })
          .filter((product) => product.variation.length > 0);
      };

      const filteredProducts = getFilteredProducts(activeFilters);

      // ============================================================
      // FILTER COUNTS
      //
      // Each filter ignores ITSELF while calculating its counts.
      //
      // Example:
      //
      // Color = Beige
      //
      // Color counts are calculated without Color=Beige,
      // but other active filters remain active.
      // ============================================================

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

        return products.flatMap((product) =>
          Array.isArray(product.variation) ? product.variation : [],
        );
      };

      // ============================================================
      // FILTER COUNTS
      //
      // Counts represent UNIQUE PRODUCTS, not variations.
      //
      // Example:
      // A product has 3 Grey variations.
      // Grey count = 1, not 3.
      //
      // Each filter ignores itself while calculating its counts.
      // ============================================================

      const filterCounts = {
        price: {
          min: minPrice,
          max: maxPrice,
        },

        colorTone: {},

        finish: {},

        thickness: {},

        size: {},

        pcs: {},

        packSize: {},
      };

      // ============================================================
      // BUILD PRODUCT COUNTS FOR ONE FILTER
      // ============================================================

      const buildProductFilterCounts = (filterKey, variationField) => {
        const products = getFilteredProducts(createFiltersWithout(filterKey));

        for (const product of products) {
          const variations = Array.isArray(product.variation)
            ? product.variation
            : [];

          // Prevent the same product from being counted
          // multiple times for the same filter value.
          const valuesForProduct = new Set();

          for (const variation of variations) {
            let value = null;

            switch (variationField) {
              case "ColorTone":
                value = variation.ColorTone;
                break;

              case "Finish":
                value = variation.Finish;
                break;

              case "Thickness":
                value = variation.Thickness;
                break;

              case "Size":
                value = variation.Size;
                break;

              case "Pcs":
                value = variation.Pcs;
                break;

              case "PackSize":
                value = variation.PackSize;
                break;

              default:
                value = null;
            }

            if (value !== null && value !== undefined && value !== "") {
              valuesForProduct.add(String(value));
            }
          }

          // Count the product only once for each value.
          for (const value of valuesForProduct) {
            filterCounts[filterKey][value] =
              (filterCounts[filterKey][value] || 0) + 1;
          }
        }
      };

      // ============================================================
      // BUILD COUNTS
      // ============================================================

      buildProductFilterCounts("colorTone", "ColorTone");

      buildProductFilterCounts("finish", "Finish");

      buildProductFilterCounts("thickness", "Thickness");

      buildProductFilterCounts("size", "Size");

      buildProductFilterCounts("pcs", "Pcs");

      buildProductFilterCounts("packSize", "PackSize");

      // ============================================================
      // PAGINATION
      // ============================================================

      const offset = Math.max(0, parseInt(ctx.query.offset || "0", 10));

      const limit = Math.max(1, parseInt(ctx.query.limit || "12", 10));

      const paginatedProducts = filteredProducts.slice(offset, offset + limit);

      // ============================================================
      // PRODUCT CARD RESPONSE
      // ============================================================

      const productsResponse = paginatedProducts
        .map((product) => {
          const variations = Array.isArray(product.variation)
            ? product.variation
            : [];

          if (!variations.length) {
            return null;
          }

          const productDiscount = toNumber(product.productDiscount);

          const categoryDiscount = toNumber(category.categoryDiscount);

          // --------------------------------------------------------
          // TRANSFORM ALL MATCHING VARIATIONS
          // --------------------------------------------------------

          const transformedVariations = variations
            .map((variation) =>
              transformVariation(variation, productDiscount, categoryDiscount),
            )
            .filter(Boolean);

          if (!transformedVariations.length) {
            return null;
          }

          // --------------------------------------------------------
          // SELECT PRODUCT CARD VARIATION
          //
          // 1. In stock first
          // 2. Cheapest per m²
          // 3. If all out of stock, cheapest per m²
          // --------------------------------------------------------

          const selectedVariation = selectProductCardVariation(
            transformedVariations,
          );

          if (!selectedVariation) {
            return null;
          }

          // --------------------------------------------------------
          // FINAL PRODUCT CARD
          // --------------------------------------------------------

          return {
            variations: transformedVariations,

            selectedVariation,

            product: {
              id: product.id,

              name: product.name || "",

              slug: product.slug || "",

              productDiscount,

              categoryDiscount,

              images: product.images?.[0]
                ? [
                    {
                      id: product.images[0].id,
                      url: product.images[0].url,
                      alt: product.images[0].alternativeText || "",
                    },
                  ]
                : [],

              createdAt: product.createdAt,

              updatedAt: product.updatedAt,
            },
          };
        })
        .filter(Boolean);

      // ============================================================
      // SEO
      // ============================================================

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

      // ============================================================
      // FINAL RESPONSE
      // ============================================================

      return {
        id: category.id,

        name: category.name,

        slug: category.slug,

        // ----------------------------------------------------------
        // NEW:
        // Total products belonging to this category,
        // independent of active filters.
        // ----------------------------------------------------------
        productCount,

        bannerImg: category.bannerImg,

        footerContent: category.footer_content,

        categoryDiscount: category.categoryDiscount,

        short_description: category.short_description,

        images:
          category.images?.map((image) => ({
            id: image.id,
            url: image.url,
            alt: image.alternativeText || image.name || category.name,
          })) || [],

        // ----------------------------------------------------------
        // Number of products AFTER filters.
        // Used for pagination.
        // ----------------------------------------------------------
        totalProducts: filteredProducts.length,

        products: productsResponse,

        filterCounts,

        seo,
      };
    },
  }),
);
