module.exports = {
  routes: [
    {
      method: "POST",
      path: "/google-auth",
      handler: "google-auth.googleLogin",
      config: {
        auth: false,
      },
    },
  ],
};