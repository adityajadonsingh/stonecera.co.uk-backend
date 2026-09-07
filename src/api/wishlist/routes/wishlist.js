"use strict";

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/wishlist",
      handler: "wishlist.get",
      config: {
        auth: { strategies: ["users-permissions"] },
      },
    },
    {
      method: "POST",
      path: "/wishlist/toggle",
      handler: "wishlist.toggle",
      config: {
        auth: { strategies: ["users-permissions"] },
      },
    },
    {
      method: "POST",
      path: "/wishlist/merge",
      handler: "wishlist.merge",
      config: {
        auth: { strategies: ["users-permissions"] },
      },
    },
    {
      method: "GET",
      path: "/wishlist/products",
      handler: "wishlist.products",
      config: {
        auth: { strategies: ["users-permissions"] },
      },
    },
  ],
};
