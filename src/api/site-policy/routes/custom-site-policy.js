"use strict";

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/site-policies/:pageName",
      handler: "custom-site-policy.findByPage",
      config: {
        auth: false,
      },
    },
  ],
};
