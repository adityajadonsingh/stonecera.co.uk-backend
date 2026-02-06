"use strict";

module.exports = {
  async find(ctx) {
    const q = (ctx.query.q || "").trim().toLowerCase();

    if (!q || q.length < 2) {
      return { categories: [], products: [] };
    }

    /* ---------------- CATEGORIES ---------------- */
    const categories = await strapi.entityService.findMany(
      "api::category.category",
      {
        filters: {
          name: { $containsi: q },
        },
        fields: ["name", "slug"],
        limit: 20,
      }
    );

    const sortedCategories = categories
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q);
        const bStarts = b.name.toLowerCase().startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 5);

    /* ---------------- PRODUCTS ---------------- */
    const products = await strapi.entityService.findMany(
      "api::product.product",
      {
        filters: {
          name: { $containsi: q },
        },
        fields: ["name", "slug"],
        limit: 30,
      }
    );

    const sortedProducts = products
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q);
        const bStarts = b.name.toLowerCase().startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8);

    return {
      categories: sortedCategories,
      products: sortedProducts,
    };
  },
};
