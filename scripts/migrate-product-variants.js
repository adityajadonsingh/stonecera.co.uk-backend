"use strict";

/**
 * ==========================================================
 * Stonecera V2 Product Variant Migration
 * Strapi v5.24.1
 *
 * Product
 *      ↓
 * Variation Component
 *      ↓
 * Product Variant Collection
 *
 * Safe to run multiple times.
 * Uses SKU as unique identifier.
 * ==========================================================
 */

const { createStrapi } = require("@strapi/strapi");

/* ==========================================================
 * CONFIG
 * ========================================================== */

const CONFIG = {
  DRY_RUN: false,

  UPDATE_EXISTING: true,

  LOG_SUCCESS: true,

  LOG_ERRORS: true,

  LOG_WARNINGS: true,
};

/* ==========================================================
 * SUMMARY
 * ========================================================== */

const summary = {
  productsProcessed: 0,

  variantsCreated: 0,

  variantsUpdated: 0,

  variantsSkipped: 0,

  errors: [],
};

/* ==========================================================
 * LOOKUP CACHE
 * ========================================================== */

const cache = {
  size: new Map(),

  thickness: new Map(),

  finish: new Map(),

  color: new Map(),

  existingSku: new Map(),
};

async function loadExistingVariants(strapi) {
  const variants = await strapi.entityService.findMany(
    "api::product-variant.product-variant",
    {
      publicationState: "preview",
      limit: -1,
    },
  );

  for (const variant of variants) {
    cache.existingSku.set(variant.sku, variant);
  }

  success(`Loaded ${variants.length} Existing Variants`);
}

/* ==========================================================
 * LOGGER
 * ========================================================== */

function divider() {
  console.log("==============================================================");
}

function log(message = "") {
  console.log(message);
}

function success(message) {
  if (CONFIG.LOG_SUCCESS) console.log(`✅ ${message}`);
}

function warning(message) {
  if (CONFIG.LOG_WARNINGS) console.log(`⚠️ ${message}`);
}

function failure(message) {
  if (CONFIG.LOG_ERRORS) console.log(`❌ ${message}`);
}

/* ==========================================================
 * STRAPI BOOTSTRAP
 * ========================================================== */

async function bootstrap() {
  const app = await createStrapi();

  await app.load();

console.log(app.documents);

  return app;
}

/* ==========================================================
 * NORMALIZATION HELPERS
 * ========================================================== */

function normalizeText(value) {
  if (!value) return "";

  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeSize(value) {
  if (!value) return "";

  let size = normalizeText(value);

  // Remove prefix
  size = size.replace(/^size\s+/i, "");

  // Special mapping
  if (size === "mix pack") {
    return "patio pack 1";
  }

  if (size === "na") {
    return "na";
  }

  // Normalize spaces
  size = size.replace(/\s*x\s*/gi, "x");

  const parts = size.split("x");

  if (parts.length !== 2) {
    return size;
  }

  const first = Number(parts[0]);
  const second = Number(parts[1]);

  if (Number.isNaN(first) || Number.isNaN(second)) {
    return size;
  }

  const bigger = Math.max(first, second);
  const smaller = Math.min(first, second);

  return `${bigger}x${smaller}`;
}

function normalizeThickness(value) {
  if (!value) return "";

  return normalizeText(value).replace(/^thickness\s+/i, "");
}

function normalizeFinish(value) {
  if (!value) return "";

  return normalizeText(value);
}

function normalizeColor(value) {
  if (!value) return "";

  return normalizeText(value);
}

/* ==========================================================
 * PRICE
 * ========================================================== */

function calculatePrice(perM2, packSize) {
  const per = Number(perM2) || 0;
  const pack = Number(packSize) || 0;

  return Number((per * pack).toFixed(2));
}

/* ==========================================================
 * VARIANT NAME
 * ========================================================== */

function generateVariantName(productName, variation) {
  const size = normalizeSize(variation.Size);

  const thickness = normalizeThickness(variation.Thickness);

  const finish = variation.Finish || "";

  const color = variation.ColorTone || "";

  return [
    productName,
    size.toUpperCase(),
    thickness.toUpperCase(),
    finish,
    color,
  ]
    .filter(Boolean)
    .join(" - ");
}

/* ==========================================================
 * LOOKUP HELPERS
 * ========================================================== */

function getLookupKey(type, value) {
  switch (type) {
    case "size":
      return normalizeSize(value);

    case "thickness":
      return normalizeThickness(value);

    case "finish":
      return normalizeFinish(value);

    case "color":
      return normalizeColor(value);

    default:
      return normalizeText(value);
  }
}

function findRelation(type, value) {
  const key = getLookupKey(type, value);

  const relation = cache[type].get(key);

  if (!relation) {
    throw new Error(`${type.toUpperCase()} not found -> ${value}`);
  }

  return relation;
}

/* ==========================================================
 * LOAD LOOKUP TABLES
 * ========================================================== */

async function loadLookupCache(strapi) {
  divider();
  log("Loading lookup collections...");
  divider();

  /*
   * Sizes
   */

  const sizes = await strapi.entityService.findMany("api::size.size", {
    publicationState: "preview",
    limit: -1,
  });

  for (const size of sizes) {
    cache.size.set(normalizeSize(size.Name), size);
  }

  success(`Loaded ${sizes.length} Sizes`);

  /*
   * Thickness
   */

  const thicknesses = await strapi.entityService.findMany(
    "api::thickness.thickness",
    {
      publicationState: "preview",
      limit: -1,
    },
  );

  for (const thickness of thicknesses) {
    cache.thickness.set(normalizeThickness(thickness.Name), thickness);
  }

  success(`Loaded ${thicknesses.length} Thicknesses`);

  /*
   * Finish
   */

  const finishes = await strapi.entityService.findMany("api::finish.finish", {
    publicationState: "preview",
    limit: -1,
  });

  for (const finish of finishes) {
    cache.finish.set(normalizeFinish(finish.Name), finish);
  }

  success(`Loaded ${finishes.length} Finishes`);

  /*
   * Color
   */

  const colors = await strapi.entityService.findMany("api::color.color", {
    publicationState: "preview",
    limit: -1,
  });

  for (const color of colors) {
    cache.color.set(normalizeColor(color.Name), color);
  }

  success(`Loaded ${colors.length} Colors`);

  divider();

  log("Lookup cache ready.");

  divider();
}

/* ==========================================================
 * VARIANT HELPERS
 * ========================================================== */

function sortVariationsByPrice(variations = []) {
  return [...variations].sort((a, b) => {
    const priceA = calculatePrice(a.Per_m2, a.PackSize);
    const priceB = calculatePrice(b.Per_m2, b.PackSize);

    return priceA - priceB;
  });
}

function findExistingVariant(sku) {
  return cache.existingSku.get(sku) || null;
}

function buildVariantData(
  product,
  variation,
  isDefault = false,
  sortOrder = 0,
) {
  const size = findRelation("size", variation.Size);

  const thickness = findRelation("thickness", variation.Thickness);

  const finish = findRelation("finish", variation.Finish);

  const color = findRelation("color", variation.ColorTone);

  const price = calculatePrice(variation.Per_m2, variation.PackSize);

  return {
    name: generateVariantName(product.name, variation),

    sku: variation.SKU,

    product: product.id,

    category: product.category?.id,

    size: size.id,

    thickness: thickness.id,

    finish: finish.id,

    color: color.id,

    variant_discount: 0,

    price,

    stock: Number(variation.Stock || 0),

    packSize: Number(variation.PackSize || 0),

    per_m2: Number(variation.Per_m2 || 0),

    pieces: Number(variation.Pcs || 0),

    isDefault,

    sortOrder,
  }; 
}

async function createVariant(strapi, data, published = true) {
  if (CONFIG.DRY_RUN) {
    return;
  }

  const created = await strapi.entityService.create(
    "api::product-variant.product-variant",
    {
      data: {
        ...data,
        publishedAt: published ? new Date() : null,
      },
    },
  );

  cache.existingSku.set(created.sku, created);

  return created;
}

async function updateVariant(strapi, id, data) {
  if (CONFIG.DRY_RUN) {
    return;
  }

  const updated = await strapi.entityService.update(
    "api::product-variant.product-variant",
    id,
    {
      data,
    },
  );

  cache.existingSku.set(updated.sku, updated);

  return updated;
}

async function createOrUpdateVariant(strapi, data, published) {
  const existing = findExistingVariant(data.sku);

  if (!existing) {
    await createVariant(strapi, data, published);

    summary.variantsCreated++;

    success(`Created ${data.sku}`);

    return;
  }

  if (!CONFIG.UPDATE_EXISTING) {
    summary.variantsSkipped++;

    warning(`${data.sku} already exists`);

    return;
  }

  await updateVariant(strapi, existing.id, data);

  summary.variantsUpdated++;

  success(`Updated ${data.sku}`);
}

/* ==========================================================
 * MIGRATION
 * ========================================================== */

async function migrate(strapi) {
  divider();
  log("Loading products...");
  divider();

  const products = await strapi.entityService.findMany("api::product.product", {
    populate: {
      category: true,
      variation: true,
    },
    publicationState: "preview",
    limit: -1,
  });

  success(`${products.length} Products Loaded`);

  divider();

  for (let productIndex = 0; productIndex < products.length; productIndex++) {
    const product = products[productIndex];
    summary.productsProcessed++;

    log("");
    divider();

    log(`[${productIndex + 1}/${products.length}] ${product.name}`);

    divider();

    if (!product.category) {
      summary.errors.push({
        product: product.name,
        sku: null,
        error: "Category Missing",
      });

      failure(`${product.name} has no category.`);

      continue;
    }

    const variations = Array.isArray(product.variation)
      ? product.variation
      : [];

    if (!variations.length) {
      warning("No Variations Found");

      continue;
    }

    const sorted = sortVariationsByPrice(variations);

    for (let index = 0; index < sorted.length; index++) {
      const variation = sorted[index];

      if (!variation.SKU) {
        throw new Error("SKU Missing");
      }

      try {
        const data = buildVariantData(product, variation, index === 0, index);

        await createOrUpdateVariant(strapi, data, !!product.publishedAt);
      } catch (err) {
        summary.errors.push({
          product: product.name,
          sku: variation.SKU,
          error: err.message,
        });

        failure(`${variation.SKU} -> ${err.message}`);
      }
    }
  }
}

/* ==========================================================
 * SUMMARY
 * ========================================================== */

function printSummary() {
  divider();

  log("Migration Completed");

  divider();

  console.table({
    Products: summary.productsProcessed,
    Created: summary.variantsCreated,
    Updated: summary.variantsUpdated,
    Skipped: summary.variantsSkipped,
    Errors: summary.errors.length,
  });

  if (summary.errors.length) {
    divider();

    log("Errors");

    divider();

    console.table(summary.errors);
  }
}

/* ==========================================================
 * MAIN
 * ========================================================== */

(async () => {
  let strapi;

  try {
    strapi = await bootstrap();

    await loadLookupCache(strapi);

    await loadExistingVariants(strapi);

    await migrate(strapi);

    printSummary();

    await strapi.destroy();

    process.exit(0);
  } catch (err) {
    console.error(err);

    if (strapi) {
      await strapi.destroy();
    }

    process.exit(1);
  }
})();
