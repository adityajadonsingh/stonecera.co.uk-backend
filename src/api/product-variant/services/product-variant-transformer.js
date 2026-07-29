// src/api/product-variant/services/product-variant-transformer.js

"use strict";

/**
 * Calculate pricing information for a product variant.
 * Assumes variant.price is the FINAL SELLING PRICE.
 */
const calculatePricing = (variant) => {
  const sellingPrice = Number(variant.price || 0);
  const packSize = Number(variant.packSize || 0);

  // Variant discount has priority over category discount
  const variantDiscount = Number(variant.discount || 0);
  const categoryDiscount = Number(variant.category?.categoryDiscount || 0);

  const discount = variantDiscount > 0 ? variantDiscount : categoryDiscount;

  const discountAmount = +(sellingPrice * (discount / 100)).toFixed(2);

  const originalPrice = +(sellingPrice + discountAmount).toFixed(2);

  const sellingPricePerM2 =
    packSize > 0 ? +(sellingPrice / packSize).toFixed(2) : 0;

  const originalPricePerM2 =
    packSize > 0 ? +(originalPrice / packSize).toFixed(2) : 0;

  return {
    isDiscounted: discount > 0,

    discount:
      discount > 0
        ? {
            percentage: discount,
            amount: discountAmount,
          }
        : null,

    price: {
      original: originalPrice,
      selling: sellingPrice,
    },

    perM2: {
      original: originalPricePerM2,
      selling: sellingPricePerM2,
    },

    packSize,
  };
};

/**
 * Returns the primary image.
 */
const getPrimaryImage = (variant) => {
  const image = variant.images?.[0] ?? variant.product?.images?.[0];

  if (!image) return null;

  return {
    url: image.url,
    alt: image.alternativeText || image.name || variant.name,
  };
};

/**
 * Returns all images.
 */
const getImages = (variant) => {
  const images =
    variant.images?.length > 0
      ? variant.images
      : (variant.product?.images ?? []);

  return images.map((image) => ({
    url: image.url,
    alt: image.alternativeText || image.name || variant.name,
  }));
};

/**
 * Product Card DTO
 */
const transformVariantCard = (variant) => {
  return {
    id: variant.id,
    documentId: variant.documentId,

    name: variant.name,
    slug: variant.slug,
    sku: variant.sku,

    image: getPrimaryImage(variant),

    stock: variant.stock,

    prices: calculatePricing(variant),

    size: variant.size?.Name ?? null,

    thickness: variant.thickness?.Name ?? null,

    finish: variant.finish?.Name ?? null,

    color: variant.color?.Name ?? null,

    labels:
      variant.labels?.map((label) => ({
        id: label.id,
        name: label.Name,
      })) ?? [],
  };
};

/**
 * Product Detail DTO
 */
const transformVariantDetail = (variant) => {
  return {
    id: variant.id,
    documentId: variant.documentId,

    name: variant.name,
    slug: variant.slug,
    sku: variant.sku,
    description: variant.description,
    
    stock: variant.stock,

    prices: calculatePricing(variant),

    images: getImages(variant),

    size: variant.size?.Name ?? null,

    thickness: variant.thickness?.Name ?? null,

    finish: variant.finish?.Name ?? null,

    color: variant.color?.Name ?? null,

    labels:
      variant.labels?.map((label) => ({
        id: label.id,
        name: label.Name,
      })) ?? [],
  };
};

module.exports = {
  calculatePricing,
  getPrimaryImage,
  getImages,
  transformVariantCard,
  transformVariantDetail,
};
