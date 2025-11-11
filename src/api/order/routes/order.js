module.exports = {
  routes: [
    {
      method: "POST",
      path: "/orders/checkout",
      handler: "order.checkout",
      config: {
        // public checkout; change if you want to require authentication
        // leave config empty so route is public
      }
    },
    {
      method: "GET",
      path: "/orders",
      handler: "order.find",
      config: {
        auth: { strategies: ["users-permissions"] } // authenticated: list user's orders
      }
    },
    {
      method: "GET",
      path: "/orders/:id",
      handler: "order.findOne",
      config: {
        auth: { strategies: ["users-permissions"] }
      }
    }
  ]
};