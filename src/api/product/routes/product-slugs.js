"use strict";

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/products/slugs",
      handler: "product-slugs.find",
      config: {
        auth: false,
      },
    },
  ],
};
