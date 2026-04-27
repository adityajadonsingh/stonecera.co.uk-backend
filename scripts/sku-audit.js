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

    // =============================
    // 🌐 FETCH INVENTORY API
    // =============================
    console.log("📡 Fetching Inventory API...");

    const inventoryRes = await axios.get(
      "https://allstones.mpgstones.co.uk:7048/BC160/ODataV4/Company('Stone%20Depo')/Inventoryapi",
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

    // 🔥 Build map: ItemNo → [VariantCodes]
    const inventoryMap = {};

    inventory.forEach((item) => {
      const itemNo = item.ItemNo;
      const variant = item.VariantCode;

      if (!inventoryMap[itemNo]) {
        inventoryMap[itemNo] = new Set();
      }

      inventoryMap[itemNo].add(variant);
    });

    // =============================
    // 🌐 FETCH PRODUCTS API
    // =============================
    console.log("\n🌐 Fetching Products API...");

    const res = await axios.get(
      "https://admin.stonecera.co.uk/api/products/all"
    );

    const products = res.data.products || [];

    console.log("📦 Products fetched:", products.length);

    // =============================
    // 🔍 MATCHING
    // =============================
    let total = 0;
    let mismatch = [];

    products.forEach((product) => {
      (product.variation || []).forEach((v) => {
        total++;

        const originalSKU = v.SKU;

        const itemNo = extractItemNo(originalSKU);
        const variant = extractVariant(originalSKU);

        const validVariants = inventoryMap[itemNo];

        if (!validVariants) {
          mismatch.push({
            product: product.name,
            sku: originalSKU,
            issue: "ItemNo not found in Inventory API",
          });
          return;
        }

        if (!validVariants.has(variant)) {
          // find closest variant
          const suggestion = findClosestVariant(
            variant,
            Array.from(validVariants)
          );

          mismatch.push({
            product: product.name,
            sku: originalSKU,
            correct: suggestion
              ? `${itemNo} / ${suggestion}`
              : null,
          });
        }
      });
    });

    // =============================
    // 📊 RESULT
    // =============================
    console.log("\n📊 RESULT:");
    console.log("Total:", total);
    console.log("Mismatched:", mismatch.length);

    console.log("\n❌ Sample mismatches:\n");

    mismatch.slice(0, 25).forEach((m) => {
      console.log(`🧱 ${m.product}`);
      console.log(`   ❌ Your SKU: ${m.sku}`);

      if (m.correct) {
        console.log(`   ✅ Correct SKU: ${m.correct}`);
      } else {
        console.log(`   ⚠️ ${m.issue}`);
      }

      console.log("");
    });

    fs.writeFileSync(
      "api-mismatch.json",
      JSON.stringify(mismatch, null, 2)
    );

    console.log("📁 Saved: api-mismatch.json");
    console.log("\n🎉 Done\n");

  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

// =============================
// HELPERS
// =============================

function extractItemNo(sku) {
  if (!sku) return "";
  return sku.split("/")[0].trim();
}

function extractVariant(sku) {
  if (!sku) return "";

  const part = sku.split("/")[1] || "";
  const clean = part.trim().toUpperCase();

  // remove leading junk like 40, 64, A, B etc
  const match = clean.match(/(\d{2,3}[A-Z]+)/);

  return match ? match[1] : clean;
}

function findClosestVariant(input, variants) {
  let best = null;
  let score = -1;

  variants.forEach((v) => {
    let s = 0;

    if (v === input) s += 100;

    if (v.slice(-3) === input.slice(-3)) s += 40;

    if (v.includes(input) || input.includes(v)) s += 30;

    if (s > score) {
      score = s;
      best = v;
    }
  });

  return best;
}

module.exports = { run };