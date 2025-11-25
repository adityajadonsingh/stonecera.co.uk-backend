// File: src/api/orders/routes/webhook.js

module.exports = {
  routes: [
    {
      method: "POST",
      path: "/orders/webhook",
      handler: "webhook.handle",
      config: {
        auth: false, 
      },
    },
  ],
};
