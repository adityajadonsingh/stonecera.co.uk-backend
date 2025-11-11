// backend/src/api/user-detail/routes/user-detail-redis.js
module.exports = {
  routes: [
    {
      method: "GET",
      path: "/user-details/redis",
      handler: "user-detail-redis.get",
      config: {
        auth: { strategies: ["users-permissions"] },
      },
    },
    {
      method: "DELETE",
      path: "/user-details/redis/clear",
      handler: "user-detail-redis.clear",
      config: {
        auth: { strategies: ["users-permissions"] },
      },
    },
  ],
};