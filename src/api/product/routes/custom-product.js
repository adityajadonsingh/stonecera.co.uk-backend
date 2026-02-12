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
    }
  ],
};
