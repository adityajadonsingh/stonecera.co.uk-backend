"use strict";

const round = (value) => Number(Number(value).toFixed(2));

module.exports = {
  async beforeCreate(event) {
    syncPricing(event.params.data);
  },

  async beforeUpdate(event) {
    syncPricing(event.params.data);
  },
};

function syncPricing(data) {
  const price = Number(data.price);
  const perM2 = Number(data.per_m2);
  const packSize = Number(data.packSize);

  if (!packSize || packSize <= 0) return;

  // User edited Price
  if (data.price !== undefined && data.per_m2 === undefined) {
    data.per_m2 = round(price / packSize);
    return;
  }

  // User edited Price/m²
  if (data.per_m2 !== undefined && data.price === undefined) {
    data.price = round(perM2 * packSize);
    return;
  }

  // Both supplied → trust price as source of truth
  if (data.price !== undefined && data.per_m2 !== undefined) {
    data.per_m2 = round(price / packSize);
  }
}