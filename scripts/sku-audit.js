process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

require("dotenv").config();

const axios = require("axios");
const https = require("https");

async function run() {
  try {
    console.log("🚀 Starting SKU audit...\n");

    const agent = new https.Agent({
      rejectUnauthorized: false,
    });

    const username = process.env.STOCK_API_USER;
    const password = process.env.STOCK_API_PASS;

    console.log("🔐 USER:", username);
    console.log("🔐 PASS:", password ? "✔️ Loaded" : "❌ Missing");

    const URL =
      "https://allstones.mpgstones.co.uk:7048/BC160/ODataV4/Company('Stone%20Depo')/Inventoryapi";

    console.log("\n🌐 Calling API...");
    console.log("👉 URL:", URL);

    // =============================
    // API CALL
    // =============================
    const apiRes = await axios.get(URL, {
      httpsAgent: agent,
      auth: {
        username,
        password,
      },
      headers: {
        Accept: "application/json",
      },
    });

    const apiData = apiRes.data.value || [];

    console.log("\n✅ API SUCCESS");
    console.log("📦 API records:", apiData.length);

    // =============================
    // BUILD API SKU SET
    // =============================
    const apiSKUSet = new Set();

    apiData.forEach((item) => {
      const sku = normalizeSKU(item.ItemNo + item.VariantCode);
      apiSKUSet.add(sku);
    });

    console.log("📦 Unique API SKUs:", apiSKUSet.size);

    // =============================
    // FETCH STRAPI PRODUCTS
    // =============================
    console.log("\n📥 Fetching Strapi products...");

    const products = await strapi.entityService.findMany(
      "api::product.product",
      {
        populate: { variation: true },
        limit: -1,
      }
    );

    console.log("📦 Products fetched:", products.length);

    let totalVariations = 0;
    let matched = 0;
    let unmatched = [];

    // =============================
    // MATCHING + SUGGESTIONS
    // =============================
    products.forEach((product) => {
      (product.variation || []).forEach((v) => {
        totalVariations++;

        const dbSKU = normalizeSKU(v.SKU);

        if (apiSKUSet.has(dbSKU)) {
          matched++;
        } else {
          const suggestions = findClosestMatches(dbSKU, apiSKUSet);

          unmatched.push({
            product: product.name,
            original: v.SKU,
            normalized: dbSKU,
            suggestions,
          });
        }
      });
    });

    // =============================
    // RESULTS
    // =============================
    console.log("\n📊 RESULT:");
    console.log("Total Variations:", totalVariations);
    console.log("Matched:", matched);
    console.log("Unmatched:", unmatched.length);

    console.log("\n❌ Unmatched SKUs with Suggestions:\n");

    unmatched.slice(0, 30).forEach((u) => {
      console.log(`🧱 Product: ${u.product}`);
      console.log(`   Original: ${u.original}`);
      console.log(`   Normalized: ${u.normalized}`);

      if (u.suggestions.length > 0) {
        console.log(`   🔍 Closest API Matches:`);
        u.suggestions.forEach((s) => {
          console.log(`      → ${s.apiSKU} (score: ${s.score})`);
        });
      } else {
        console.log(`   ⚠️ No close match found`);
      }

      console.log("");
    });

    if (unmatched.length > 30) {
      console.log(`...and ${unmatched.length - 30} more`);
    }

    console.log("\n🎉 Audit completed\n");

  } catch (err) {
    console.error("\n❌ ERROR:");
    console.error(err.response?.status);
    console.error(err.response?.data);
    console.error(err.message);
  }
}

// =============================
// NORMALIZER (BASIC CLEAN ONLY)
// =============================
function normalizeSKU(sku) {
  if (!sku) return "";

  return sku
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace("/", "")
    .trim();
}

// =============================
// FIND CLOSEST MATCHES
// =============================
function findClosestMatches(dbSKU, apiSKUs) {
  const matches = [];

  for (const apiSKU of apiSKUs) {
    let score = 0;

    // strong match if substring
    if (apiSKU.includes(dbSKU) || dbSKU.includes(apiSKU)) {
      score += 50;
    }

    // ending match (variant similarity)
    const dbEnd = dbSKU.slice(-5);
    const apiEnd = apiSKU.slice(-5);

    if (dbEnd === apiEnd) score += 30;

    // starting match (item code similarity)
    const dbStart = dbSKU.slice(0, 6);
    const apiStart = apiSKU.slice(0, 6);

    if (dbStart === apiStart) score += 20;

    if (score > 0) {
      matches.push({ apiSKU, score });
    }
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

module.exports = { run };