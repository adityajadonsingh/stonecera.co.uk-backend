"use strict";

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/product-catalogues",
      handler: "product-catalogue.find",
      config: {
        auth: false,
      },
    },
  ],
};
