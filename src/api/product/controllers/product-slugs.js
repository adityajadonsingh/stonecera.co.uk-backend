"use strict";

module.exports = {
  async find(ctx) {
    const products = await strapi.entityService.findMany(
      "api::product.product",
      {
        fields: ["slug"],
        publicationState: "live",
        limit: -1, // 🔥 IMPORTANT → no pagination
      }
    );

    return products.map((p) => ({
      slug: p.slug,
    }));
  },
};
