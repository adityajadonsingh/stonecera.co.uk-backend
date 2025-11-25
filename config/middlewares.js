export default [
  "strapi::errors",

  {
    name: "strapi::body",
    config: {
      includeUnparsed: true,
      includePaths: ["/api/orders/webhook"],
    },
  },

  "strapi::security",

  {
    name: "strapi::cors",
    config: {
      origin: ["*"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    },
  },

  "strapi::poweredBy",
  "strapi::logger",
  "strapi::query",
  "strapi::session",
  "strapi::favicon",
  "strapi::public",
];
