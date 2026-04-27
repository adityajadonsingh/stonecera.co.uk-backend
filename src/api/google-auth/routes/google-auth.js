//File: backend/src/api/google-auth/routes/google-auth.js

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