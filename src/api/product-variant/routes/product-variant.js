"use strict";

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/product-variants/:slug",
      handler: "product-variant.customDetail",
      config: {
        auth: false,
      },
    },
  ],
};