"use strict";

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/products",
      handler: "custom-product.list",
      config: {
        auth: false,
      },
    },
    {
      method: "GET",
      path: "/product/:slug",
      handler: "custom-product.detail",
      config: {
        auth: false,
      },
    },
    {
      method: "PUT",
      path: "/products/:productId/update-variation",
      handler: "custom-product.updateVariation",
      config: {
        auth: false,
      },
    },
  ],
};
