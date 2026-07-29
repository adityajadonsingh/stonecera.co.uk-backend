"use strict";

/**
 * product-variant controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
const {
  getVariantBySlug,
  getOtherVariants,
  getRelatedVariants,
  buildBreadcrumbs,
} = require("../services/product-variant-query");

const {
  transformVariantDetail,
} = require("../services/product-variant-transformer");

module.exports = createCoreController(
  "api::product-variant.product-variant",
  ({ strapi }) => ({
    async customDetail(ctx) {
      const { slug } = ctx.params;

      // Get current variant
      const variant = await getVariantBySlug(strapi, slug);

      if (!variant) {
        return ctx.notFound("Product Variant not found");
      }

      console.log(variant.product.images);

      // Detail DTO
      const productVariant = transformVariantDetail(variant);

      // Other variants of same product
      const otherVariants = await getOtherVariants(
        strapi,
        variant.product.id,
        variant.id,
      );

      // Related variants from same category
      const relatedVariants = await getRelatedVariants(
        strapi,
        variant.category.id,
        variant.product.id,
        variant.id,
      );

      // Breadcrumbs
      const breadcrumbs = buildBreadcrumbs(variant);

      return {
        productVariant,
        otherVariants,
        breadcrumbs,
        relatedVariants,
      };
    },
  }),
);
