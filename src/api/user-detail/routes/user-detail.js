module.exports = {
  routes: [
    {
      method: "GET",
      path: "/user-details/me",
      handler: "user-detail.me",
      config: {},
    },
    {
      method: "POST",
      path: "/user-details/me",
      handler: "user-detail.upsert",
      config: {},
    },
  ],
};