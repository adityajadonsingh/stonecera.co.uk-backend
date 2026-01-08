"use strict";

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/homepage",
      handler: "homepage.find",
      config: {
        auth: false,
      },
    },
  ],
};
