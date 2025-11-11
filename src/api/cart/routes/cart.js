// backend/src/api/cart/routes/cart.js
module.exports = {
  routes: [
    {
      method: "POST",
      path: "/cart/add",
      handler: "api::cart.cart.add",
      config: {}, // no policy here; controller will check auth
    },
    {
      method: "GET",
      path: "/cart",
      handler: "api::cart.cart.find",
      config: {},
    },
    {
      method: "PUT",
      path: "/cart/:id",
      handler: "api::cart.cart.update",
      config: {},
    },
    {
      method: "DELETE",
      path: "/cart/:id",
      handler: "api::cart.cart.remove",
      config: {},
    },
  ],
};