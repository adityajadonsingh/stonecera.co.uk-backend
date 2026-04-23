const { run } = require("./sku-audit");

(async () => {
  try {
    console.log("⚙️ Booting Strapi...");

    const strapiInstance = await require("@strapi/strapi")
      .createStrapi()
      .load();

    global.strapi = strapiInstance;

    console.log("✅ Strapi loaded\n");

    await run();

    console.log("\n🎉 Audit completed");

    process.exit(0);
  } catch (err) {
    console.error("❌ Boot error:", err);
    process.exit(1);
  }
})();