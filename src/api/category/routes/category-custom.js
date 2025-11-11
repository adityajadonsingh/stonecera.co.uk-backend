'use strict';

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/categories",
      handler: "category.customList",
      config: { auth: false },
    },
    {
      method: "GET",
      path: "/category/:slug",
      handler: "category.customDetail",
      config: { auth: false },
    },
  ],
};
