"use strict";

module.exports = {
  async find(ctx) {
    const items = await strapi.entityService.findMany(
      "api::product-catalogue.product-catalogue",
      {
        filters: { isActive: true },
        populate: {
          thumbnail: { fields: ["url", "alternativeText"] },
          file: { fields: ["url", "name"] },
        },
        sort: { createdAt: "desc" },
        publicationState: "live",
      }
    );

    return items.map((item) => ({
      id: item.id,
      name: item.name,
      thumbnail: item.thumbnail
        ? {
            url: item.thumbnail.url,
            alt: item.thumbnail.alternativeText || item.name,
          }
        : null,
      file: item.file
        ? {
            url: item.file.url,
            name: item.file.name,
          }
        : null,
    }));
  },
};
