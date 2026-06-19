process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

require("dotenv").config();

const axios = require("axios");
const https = require("https");

async function run() {
  const agent = new https.Agent({
    rejectUnauthorized: false,
  });

  console.log("Fetching inventory...");

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

  console.log("Inventory:", inventory.length);

  const inventoryMap = new Map();

  inventory.forEach((item) => {
    const sku = (item.NewSKU || "").trim().toUpperCase();

    if (!sku) return;

    inventoryMap.set(
      sku,
      item.OnGround_Crates === "Out of Stock"
        ? 0
        : Number(item.OnGround_Crates) || 0
    );
  });

  const productRes = await axios.get(
    "https://admin.stonecera.co.uk/api/products/all"
  );

  const products = productRes.data.products || [];

  let matched = 0;
  let changed = 0;

  products.forEach((product) => {
    (product.variation || []).forEach((v) => {
      const sku = (v.SKU || "").trim().toUpperCase();

      if (!inventoryMap.has(sku)) return;

      matched++;

      const apiStock = inventoryMap.get(sku);

      if (Number(v.Stock) !== apiStock) {
        changed++;

        console.log(
          `${sku}
          WEBSITE: ${v.Stock}
          API: ${apiStock}`
        );
      }
    });
  });

  console.log("\n====================");
  console.log("Matched:", matched);
  console.log("Need Update:", changed);
  console.log("====================");
}

run();