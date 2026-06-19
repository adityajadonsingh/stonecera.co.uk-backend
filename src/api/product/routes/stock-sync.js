// src/api/product/routes/stock-sync.js

module.exports = {
  routes: [
    {
      method: "POST",
      path: "/products/sync-stock",
      handler: "custom-product.syncStock",
      config: {
        auth: false,
      },
    },
  ],
};