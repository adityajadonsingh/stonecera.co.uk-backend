process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

require("dotenv").config();

const axios = require("axios");
const https = require("https");

async function run() {
  try {
    const agent = new https.Agent({
      rejectUnauthorized: false,
    });

    console.log("📦 Fetching Inventory API...");

    const inventoryRes = await axios.get(
      "https://allstones.mpgstones.co.uk:7048/BC160/ODataV4/newsku?Company='P_SURFACES'",
      {
        httpsAgent: agent,
        auth: {
          username: process.env.STOCK_API_USER,
          password: process.env.STOCK_API_PASS,
        },
      },
    );

    const inventory = inventoryRes.data.value || [];

    console.log("Inventory Records:", inventory.length);

    console.log("🌐 Fetching Strapi Products...");

    const productsRes = await axios.get(
      "https://admin.stonecera.co.uk/api/products/all",
    );

    const products = productsRes.data.products || [];

    console.log("Products:", products.length);

    // ==========================
    // Inventory SKU Map
    // ==========================

    const inventoryMap = new Map();

    inventory.forEach((item) => {
      const sku = (item.NewSKU || "").trim().toUpperCase();

      if (!sku) return;

      const stock =
        item.OnGround_Crates === "Out of Stock"
          ? 0
          : Number(item.OnGround_Crates) || 0;

      inventoryMap.set(sku, stock);
    });

    // ==========================
    // Find Changed Stocks
    // ==========================

    const updates = [];

    let matched = 0;

    products.forEach((product) => {
      (product.variation || []).forEach((variation) => {
        const sku = (variation.SKU || "").trim().toUpperCase();
        if (!inventoryMap.has(sku)) {
          return;
        }
        matched++;
        const apiStock = inventoryMap.get(sku);
        const websiteStock = Number(variation.Stock) || 0;

        if (apiStock !== websiteStock) {
          updates.push({
            SKU: sku,
            Stock: apiStock,
          });

          console.log(
            `UPDATE:
              SKU: ${sku}
              WEBSITE: ${websiteStock}
              API: ${apiStock}
              `,
          );
        }
      });
    });

    console.log("\n=======================");
    console.log("Matched:", matched);
    console.log("Updates:", updates.length);
    console.log("=======================\n");

    if (updates.length === 0) {
      console.log("✅ No stock updates needed");
      return;
    }

    // ==========================
    // Push Updates To Strapi
    // ==========================

    console.log("🚀 Sending updates to Strapi...");

    const syncRes = await axios.post(
      "https://admin.stonecera.co.uk/api/products/sync-stock",
      updates,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    console.log("✅ Sync Complete:");

    console.log(syncRes.data);
  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
  }
}

run();