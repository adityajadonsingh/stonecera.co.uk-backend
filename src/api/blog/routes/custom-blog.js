"use strict";

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/blogs/:slug",
      handler: "custom-blog.findOne",
      config: {
        auth: false,
      },
    },
  ],
};
