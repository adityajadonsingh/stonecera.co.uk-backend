// scripts/addVariationUUIDs_v5.js
import { v4 as uuidv4 } from "uuid";

/**
 * Strapi v5 version: uses entityService
 */
export async function run(strapi) {
  // 1️⃣  Fetch all products with variations populated
  const products = await strapi.entityService.findMany("api::product.product", {
    populate: { variation: true },
    publicationState: "preview", // fetch both draft and published
  });

  for (const product of products) {
    const variations = product.variation || [];
    // Check if any variation is missing uuid
    const needsUpdate = variations.some(
      (v) => !v.uuid || v.uuid.trim() === ""
    );
    if (!needsUpdate) continue;

    const updatedVariations = variations.map((v) => ({
      ...v,
      uuid: v.uuid && v.uuid !== "" ? v.uuid : uuidv4(),
    }));

    // 2️⃣  Update the product
    await strapi.entityService.update("api::product.product", product.id, {
      data: { variation: updatedVariations },
    });

    console.log(`✅ Product "${product.name}": UUIDs added or preserved`);
  }

  console.log("🎉  All variations now have UUIDs.");
}