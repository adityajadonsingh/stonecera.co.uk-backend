"use strict";

/**
 * Round a monetary value to 2 decimal places.
 */
const roundMoney = (value) => {
  return Number(Number(value || 0).toFixed(2));
};

/**
 * Get the effective discount.
 *
 * Product discount has priority over category discount.
 */
const getEffectiveDiscount = (productDiscount = 0, categoryDiscount = 0) => {
  const productDisc = Number(productDiscount || 0);
  const categoryDisc = Number(categoryDiscount || 0);

  return productDisc > 0 ? productDisc : categoryDisc > 0 ? categoryDisc : 0;
};

/**
 * Calculate pricing for a single variation.
 *
 * IMPORTANT:
 * Price is the PACK PRICE stored in Strapi.
 * Per_m2 is calculated from:
 *
 *      Pack Price / Pack Size
 *
 * We intentionally do NOT use the existing Per_m2 value
 * stored in the variation.
 */
const calculateVariationPricing = (
  variation,
  productDiscount = 0,
  categoryDiscount = 0
) => {
  const packPrice = Number(variation?.Price || 0);
  const packSize = Number(variation?.PackSize || 0);

  const perM2 =
    packPrice > 0 && packSize > 0
      ? roundMoney(packPrice / packSize)
      : 0;

  const discount = getEffectiveDiscount(
    productDiscount,
    categoryDiscount
  );

  let originalPackPrice = packPrice;
  let originalPerM2 = perM2;

  if (discount > 0) {
    const multiplier = 1 + discount / 100;

    originalPackPrice = roundMoney(packPrice * multiplier);
    originalPerM2 = roundMoney(perM2 * multiplier);
  }

  return {
    isDiscounted: discount > 0,

    discount:
      discount > 0
        ? {
            percentage: discount,
            amount: roundMoney(originalPackPrice - packPrice),
          }
        : null,

    pack: {
      original: originalPackPrice,
      selling: packPrice,
    },

    perM2: {
      original: originalPerM2,
      selling: perM2,
    },

    packSize,
  };
};

/**
 * Normalize a product variation for frontend use.
 *
 * Pricing is always calculated server-side.
 */
const transformVariation = (
  variation,
  productDiscount = 0,
  categoryDiscount = 0
) => {
  if (!variation) return null;

  return {
    id: variation.uuid || variation.id,

    SKU: variation.SKU || null,

    Stock: Number(variation.Stock || 0),

    Thickness: variation.Thickness || null,
    Size: variation.Size || null,
    Finish: variation.Finish || null,
    Pcs: Number(variation.Pcs || 0),
    ColorTone: variation.ColorTone || null,

    PackSize: Number(variation.PackSize || 0),

    pricing: calculateVariationPricing(
      variation,
      productDiscount,
      categoryDiscount
    ),
  };
};

const selectProductCardVariation = (variations = []) => {
  if (!Array.isArray(variations) || !variations.length) {
    return null;
  }

  const normalized = variations.filter(Boolean);

  const inStock = normalized.filter(
    (variation) => Number(variation.Stock || 0) > 0
  );

  const candidates = inStock.length > 0 ? inStock : normalized;

  return candidates.reduce((lowest, current) => {
    const currentPrice = Number(
      current?.pricing?.perM2?.selling || 0
    );

    const lowestPrice = Number(
      lowest?.pricing?.perM2?.selling || 0
    );

    return currentPrice < lowestPrice ? current : lowest;
  });
};

module.exports = {
  roundMoney,
  getEffectiveDiscount,
  calculateVariationPricing,
  transformVariation,
  selectProductCardVariation,
};