const { createCoreController } = require("@strapi/strapi").factories;

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
          select: ["name", "slug", "categoryDiscount"],
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
          });
        }
      }

      return uniqueCategories;
    },

    // ----------------------------------------------------------------
    async customDetail(ctx) {
      const { slug } = ctx.params;
      const { price, colorTone, finish, thickness, size } = ctx.query;

      // 1️⃣ Parse filters
      const filters = {};
      if (price) {
        const [minPrice, maxPrice] = price.split("-").map(Number);
        filters.Price = { $gte: minPrice, $lte: maxPrice };
      }
      if (colorTone) filters["variation.ColorTone"] = colorTone.trim();
      if (finish) filters["variation.Finish"] = finish.trim();
      if (thickness) filters["variation.Thickness"] = thickness.trim();
      if (size) filters["variation.Size"] = size.trim();

      // 2️⃣ Fetch category with products + variations
      const category = await strapi.db.query("api::category.category").findOne({
        where: { slug },
        populate: {
          images: { select: ["id", "url", "alternativeText"] },
          products: {
            select: [
              "name",
              "slug",
              "createdAt",
              "updatedAt",
              "productDiscount",
            ],
            populate: {
              images: { select: ["id", "url", "alternativeText"] },
              variation: true,
            },
          },
          seo: true,
        },
      });

      if (!category) return ctx.notFound("Category not found");

      // --- Compute Price for each variation based on PackSize * Per_m2
      category.products.forEach((prod) => {
        prod.variation.forEach((v) => {
          const per_m2 =
            typeof v.Per_m2 === "number" ? v.Per_m2 : parseFloat(v.Per_m2) || 0;
          const pack =
            typeof v.PackSize === "number"
              ? v.PackSize
              : parseFloat(v.PackSize) || 0;
          const price =
            typeof v.Price === "number" ? v.Price : parseFloat(v.Price) || 0;

          // ✅ Intelligent fallback:
          if (!price && per_m2 && pack) {
            v.Price = parseFloat((pack * per_m2).toFixed(2));
          } else if (!per_m2 && price && pack) {
            v.Per_m2 = parseFloat((price / pack).toFixed(2));
          } else {
            v.Price = price;
            v.Per_m2 = per_m2;
          }
        });
      });

      // 3️⃣ Prepare base filter counts
      const filterCounts = {
        price: {},
        colorTone: Object.fromEntries(ENUMS.colorTone.map((opt) => [opt, 0])),
        finish: {},
        thickness: Object.fromEntries(ENUMS.thickness.map((opt) => [opt, 0])),
        size: Object.fromEntries(ENUMS.size.map((opt) => [opt, 0])),
        pcs: {},
        packSize: {},
      };

      const priceRanges = [
        { label: "0-200", min: 0, max: 200 },
        { label: "200-300", min: 200, max: 300 },
        { label: "300-500", min: 300, max: 500 },
        { label: "500-1000", min: 500, max: 1000 },
        { label: "1000-2000", min: 1000, max: 2000 },
      ];
      priceRanges.forEach((r) => (filterCounts.price[r.label] = 0));

      // 4️⃣ Filter products by all active filters (for display)
      const filteredProducts = category.products
        .map((prod) => {
          const filteredVariations = prod.variation.filter((v) => {
            let match = true;
            if (filters.Price) {
              if (v.Price < filters.Price.$gte || v.Price > filters.Price.$lte)
                match = false;
            }
            if (
              filters["variation.ColorTone"] &&
              v.ColorTone !== filters["variation.ColorTone"]
            )
              match = false;
            if (
              filters["variation.Finish"] &&
              v.Finish !== filters["variation.Finish"]
            )
              match = false;
            if (
              filters["variation.Thickness"] &&
              v.Thickness !== filters["variation.Thickness"]
            )
              match = false;
            if (
              filters["variation.Size"] &&
              v.Size !== filters["variation.Size"]
            )
              match = false;
            return match;
          });
          return { ...prod, variation: filteredVariations };
        })
        .filter((prod) => prod.variation.length > 0);

      // helper for counts
      const computeVisibleCount = (excludeKey) => {
        const active = Object.entries(filters).reduce((acc, [key, val]) => {
          if (key !== excludeKey) acc[key] = val;
          return acc;
        }, {});
        const subset = category.products
          .map((prod) => {
            const variations = prod.variation.filter((v) => {
              let match = true;
              if (
                active.Price &&
                (v.Price < active.Price.$gte || v.Price > active.Price.$lte)
              )
                match = false;
              if (
                active["variation.ColorTone"] &&
                v.ColorTone !== active["variation.ColorTone"]
              )
                match = false;
              if (
                active["variation.Finish"] &&
                v.Finish !== active["variation.Finish"]
              )
                match = false;
              if (
                active["variation.Thickness"] &&
                v.Thickness !== active["variation.Thickness"]
              )
                match = false;
              if (
                active["variation.Size"] &&
                v.Size !== active["variation.Size"]
              )
                match = false;
              return match;
            });
            return { ...prod, variation: variations };
          })
          .filter((prod) => prod.variation.length > 0);
        return subset;
      };

      // 5️⃣ Count each filter group options
      computeVisibleCount("Price").forEach((prod) => {
        prod.variation.forEach((v) => {
          if (v.Price != null) {
            for (const range of priceRanges) {
              if (v.Price >= range.min && v.Price < range.max)
                filterCounts.price[range.label] += 1;
            }
          }
        });
      });

      computeVisibleCount("variation.ColorTone").forEach((prod) => {
        prod.variation.forEach((v) => {
          if (v.ColorTone && filterCounts.colorTone[v.ColorTone] != null)
            filterCounts.colorTone[v.ColorTone] += 1;
        });
      });

      computeVisibleCount("variation.Finish").forEach((prod) => {
        prod.variation.forEach((v) => {
          if (v.Finish)
            filterCounts.finish[v.Finish] =
              (filterCounts.finish[v.Finish] || 0) + 1;
        });
      });

      computeVisibleCount("variation.Thickness").forEach((prod) => {
        prod.variation.forEach((v) => {
          if (v.Thickness && filterCounts.thickness[v.Thickness] != null)
            filterCounts.thickness[v.Thickness] += 1;
        });
      });

      computeVisibleCount("variation.Size").forEach((prod) => {
        prod.variation.forEach((v) => {
          if (v.Size && filterCounts.size[v.Size] != null)
            filterCounts.size[v.Size] += 1;
        });
      });

      filteredProducts.forEach((prod) => {
        prod.variation.forEach((v) => {
          if (v.Pcs)
            filterCounts.pcs[String(v.Pcs)] =
              (filterCounts.pcs[String(v.Pcs)] || 0) + 1;
          if (v.PackSize)
            filterCounts.packSize[String(v.PackSize)] =
              (filterCounts.packSize[String(v.PackSize)] || 0) + 1;
        });
      });

      // 6️⃣ Pagination
      const start = parseInt(ctx.query.offset || 0);
      const limit = parseInt(ctx.query.limit || 12);
      const paginatedProducts = filteredProducts.slice(start, start + limit);

      // 7️⃣ Prepare final products
      const productsResponse = paginatedProducts.map((prod) => {
        const variations = prod.variation || [];
        let chosenVariation = null;

        if (variations.length === 1) chosenVariation = variations[0];
        else if (variations.length > 1) {
          const inStock = variations.filter(
            (v) =>
              typeof v.Per_m2 === "number" &&
              typeof v.Stock === "number" &&
              v.Stock > 0
          );
          const outOfStock = variations.filter(
            (v) => typeof v.Per_m2 === "number" && v.Stock <= 0
          );

          if (inStock.length)
            chosenVariation = inStock.reduce((min, v) =>
              v.Per_m2 < (min.Per_m2 ?? Infinity) ? v : min
            );
          else if (outOfStock.length)
            chosenVariation = outOfStock.reduce((min, v) =>
              v.Per_m2 < (min.Per_m2 ?? Infinity) ? v : min
            );
          else chosenVariation = variations[0];
        }

        const v = chosenVariation;
        const perM2 = typeof v?.Per_m2 === "number" ? v.Per_m2 : 0;
        const pack = typeof v?.PackSize === "number" ? v.PackSize : 0;
        const price = perM2 && pack ? parseFloat((perM2 * pack).toFixed(2)) : 0;

        // compute discounts
        const prodDisc = prod.productDiscount ?? 0;
        const catDisc = category.categoryDiscount ?? 0;
        const usedDiscount =
          prodDisc && prodDisc > 0
            ? prodDisc
            : catDisc && catDisc > 0
              ? catDisc
              : 0;

        let priceBeforeDiscount = null;
        if (usedDiscount > 0) {
          const mul = 1 + usedDiscount / 100;
          priceBeforeDiscount = {
            Per_m2: parseFloat((perM2 * mul).toFixed(2)),
            Price: parseFloat((price * mul).toFixed(2)),
          };
        }

        return {
          variation: {
            id: v.uuid,
            SKU: v.SKU,
            Per_m2: perM2,
            Thickness: v.Thickness,
            Size: v.Size,
            Finish: v.Finish,
            PackSize: v.PackSize,
            Pcs: v.Pcs,
            Stock: v.Stock,
            ColorTone: v.ColorTone,
            Price: price,
          },
          priceBeforeDiscount,
          product: {
            name: prod.name,
            slug: prod.slug,
            productDiscount: prod.productDiscount ?? 0,
            categoryDiscount: category.categoryDiscount ?? 0,
            images:
              prod.images?.map((img) => ({
                id: img.id,
                url: img.url,
                alt: img.alternativeText,
              })) ?? [],
            createdAt: prod.createdAt,
            updatedAt: prod.updatedAt,
          },
        };
      });

      // 8️⃣ Return
      return {
        name: category.name,
        slug: category.slug,
        categoryDiscount: category.categoryDiscount,
        short_description: category.short_description,
        images: category.images?.map((img) => ({
          id: img.id,
          url: img.url,
          alt: img.alternativeText,
        })),
        totalProducts: filteredProducts.length,
        products: productsResponse,
        seo: category.seo,
        filterCounts,
      };
    },
  })
);
