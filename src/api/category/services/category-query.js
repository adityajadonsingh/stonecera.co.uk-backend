"use strict";

const {
  transformVariantCard,
} = require("../../product-variant/services/product-variant-transformer");

const getCategoryBySlug = async (strapi, slug) => {
  return await strapi.documents("api::category.category").findFirst({
    filters: {
      slug,
    },

    populate: {
      bannerImg: true,
      images: true,

      seo: {
        populate: {
          og_image: true,
          twitter_image: true,
        },
      },
    },
  });
};

const getCategoryVariants = async (strapi, categoryId) => {
  const variants = await strapi
    .documents("api::product-variant.product-variant")
    .findMany({
      filters: {
        category: {
          id: categoryId,
        },
      },

      populate: {
        images: true,

        category: {
          fields: ["id", "categoryDiscount"],
        },

        product: {
          fields: [
            "id",
            "documentId",
            "name",
            "slug",
          ],

          populate: {
            images: true,
          },
        },

        size: true,
        thickness: true,
        finish: true,
        color: true,

        labels: true,
      },

      sort: {
        sortOrder: "asc",
      },
    });

  return variants.map(transformVariantCard);
};

module.exports = {
  getCategoryBySlug,
  getCategoryVariants,
};
