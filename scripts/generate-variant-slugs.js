"use strict";

const slugify = (str) =>
  String(str || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-");

module.exports = async ({ strapi }) => {
  console.log("Generating Product Variant Slugs...\n");

  const variants = await strapi
    .documents("api::product-variant.product-variant")
    .findMany({
      pagination: {
        page: 1,
        pageSize: 10000,
      },
      populate: {
        product: {
          fields: ["slug"],
        },
        size: {
          fields: ["Name"],
        },
        thickness: {
          fields: ["Name"],
        },
      },
    });

  console.log(`Found ${variants.length} variants\n`);

  let updated = 0;

  for (const variant of variants) {
    const productSlug = variant.product?.slug;

    if (!productSlug) {
      console.log(`Skipping Variant ${variant.id} - Product slug missing`);
      continue;
    }

    const normalizeSize = (size) => {
      if (!size) return "";

      return size
        .replace(/\s*pack\s*1$/i, " Pack") // Patio Pack 1 -> Patio Pack
        .trim();
    };

    const size = slugify(normalizeSize(variant.size?.Name));

    const thickness = slugify(variant.thickness?.Name);

    const slug = [productSlug, size, thickness].filter(Boolean).join("-");

    await strapi.documents("api::product-variant.product-variant").update({
      documentId: variant.documentId,
      data: {
        slug,
        publishedAt: new Date(),
      },
    });

    updated++;

    console.log(`✓ ${slug}`);
  }

  console.log("\n--------------------------------");
  console.log(`Updated ${updated} variants`);
  console.log("--------------------------------");
};
