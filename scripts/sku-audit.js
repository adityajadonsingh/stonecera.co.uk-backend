process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

require("dotenv").config();

const axios = require("axios");
const https = require("https");
const fs = require("fs");

async function run() {
  try {
    console.log("🚀 Starting API vs API SKU audit...\n");

    const agent = new https.Agent({
      rejectUnauthorized: false,
    });

    // ==========================================
    // FETCH INVENTORY API
    // ==========================================
    console.log("📡 Fetching Inventory API...");

    const inventoryRes = await axios.get(
      "https://allstones.mpgstones.co.uk:7048/BC160/ODataV4/newsku?Company='P_SURFACES'",
      {
        httpsAgent: agent,
        auth: {
          username: process.env.STOCK_API_USER,
          password: process.env.STOCK_API_PASS,
        },
      }
    );

    const inventory = inventoryRes.data.value || [];

    console.log("📦 Inventory records:", inventory.length);

    // ==========================================
    // BUILD INVENTORY SKU MAP
    // ==========================================
    const inventorySkuMap = {};

    inventory.forEach((item) => {
      const sku = (item.NewSKU || "")
        .trim()
        .toUpperCase();

      if (sku) {
        inventorySkuMap[sku] = item;
      }
    });

    console.log(
      "🔍 Sample Inventory SKUs:",
      Object.keys(inventorySkuMap).slice(0, 5)
    );

    // ==========================================
    // FETCH STRAPI PRODUCTS
    // ==========================================
    console.log("\n🌐 Fetching Products API...");

    const productsRes = await axios.get(
      "https://admin.stonecera.co.uk/api/products/all"
    );

    const products = productsRes.data.products || [];

    console.log("📦 Products fetched:", products.length);

    // ==========================================
    // WEBSITE → API CHECK
    // ==========================================
    let totalVariations = 0;

    const websiteMissingInApi = [];

    const websiteSkuSet = new Set();

    products.forEach((product) => {
      (product.variation || []).forEach((variation) => {
        totalVariations++;

        const websiteSKU = (variation.SKU || "")
          .trim()
          .toUpperCase();

        if (!websiteSKU) {
          websiteMissingInApi.push({
            product: product.name,
            sku: "",
            issue: "Empty SKU in Strapi",
          });
          return;
        }

        websiteSkuSet.add(websiteSKU);

        if (!inventorySkuMap[websiteSKU]) {
          websiteMissingInApi.push({
            product: product.name,
            sku: websiteSKU,
            stock: variation.Stock,
            issue: "SKU not found in Inventory API",
          });
        }
      });
    });

    // ==========================================
    // API → WEBSITE CHECK
    // ==========================================
    const apiMissingInWebsite = [];

    Object.keys(inventorySkuMap).forEach((sku) => {
      if (!websiteSkuSet.has(sku)) {
        apiMissingInWebsite.push({
          sku,
          product_name: inventorySkuMap[sku].Product_Name,
          inventory_stock:
            inventorySkuMap[sku].OnGround_Crates,
        });
      }
    });

    // ==========================================
    // SUMMARY
    // ==========================================
    console.log("\n================================");
    console.log("📊 AUDIT SUMMARY");
    console.log("================================");

    console.log(
      "Website Variations:",
      totalVariations
    );

    console.log(
      "Website → API Missing:",
      websiteMissingInApi.length
    );

    console.log(
      "API → Website Missing:",
      apiMissingInWebsite.length
    );

    // ==========================================
    // SAMPLE OUTPUT
    // ==========================================
    console.log(
      "\n❌ WEBSITE SKUs NOT FOUND IN API:\n"
    );

    websiteMissingInApi
      .slice(0, 20)
      .forEach((item) => {
        console.log(
          `🧱 ${item.product}`
        );
        console.log(
          `   SKU: ${item.sku}`
        );
        console.log(
          `   ISSUE: ${item.issue}`
        );
        console.log("");
      });

    console.log(
      "\n⚠️ API SKUs NOT FOUND ON WEBSITE:\n"
    );

    apiMissingInWebsite
      .slice(0, 20)
      .forEach((item) => {
        console.log(
          `SKU: ${item.sku}`
        );
        console.log(
          `Product: ${item.product_name}`
        );
        console.log(
          `Stock: ${item.inventory_stock}`
        );
        console.log("");
      });

    // ==========================================
    // SAVE REPORTS
    // ==========================================
    fs.writeFileSync(
      "website-missing-in-api.json",
      JSON.stringify(
        websiteMissingInApi,
        null,
        2
      )
    );

    fs.writeFileSync(
      "api-missing-in-website.json",
      JSON.stringify(
        apiMissingInWebsite,
        null,
        2
      )
    );

    console.log(
      "\n📁 Saved: website-missing-in-api.json"
    );

    console.log(
      "📁 Saved: api-missing-in-website.json"
    );

    console.log("\n🎉 Audit Complete\n");
  } catch (err) {
    console.error(
      "❌ Error:",
      err.response?.data || err.message
    );
  }
}

run();