"use strict";

module.exports = {
  routes: [
    {
      method: "POST",
      path: "/product-reviews",
      handler: "product-review.create",
      config: {
        auth: false,
      },
    },
  ],
};
