// File: src/api/order/routes/order.js

module.exports = {
  routes: [
    {
      method: "POST",
      path: "/orders/checkout",
      handler: "order.checkout",
      config: {
        auth: { strategies: ["users-permissions"] }, 
      },
    },
    {
      method: "GET",
      path: "/orders",
      handler: "order.find",
      config: {
        auth: { strategies: ["users-permissions"] },
      },
    },
    {
      method: "GET",
      path: "/orders/:id",
      handler: "order.findOne",
      config: {
        auth: { strategies: ["users-permissions"] },
      },
    },
    {
      method: "POST",
      path: "/orders/stripe-session",
      handler: "order.createStripeSession",
      config: {
        auth: false,
      },
    },
  ],
};
