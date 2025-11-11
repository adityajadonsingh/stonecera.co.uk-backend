// src/api/product/routes/custom-product.js
export default {
  routes: [
    // GET /api/products?limit=12&page=1
    {
      method: "GET",
      path: "/products",
      handler: "custom-product.list",
      config: {
        auth: false,
      },
    },
    // GET /api/product/:slug
    {
      method: "GET",
      path: "/product/:slug",
      handler: "custom-product.detail",
      config: {
        auth: false,
      },
    },
  ],
};