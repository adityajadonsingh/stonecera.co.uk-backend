// backend/config/plugins.ts
export default ({ env }) => ({
  email: {
    config: {
      provider: "@strapi/provider-email-nodemailer",
      providerOptions: {
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          type: "OAuth2",
          user: env("GMAIL_USER"),
          clientId: env("GMAIL_CLIENT_ID"),
          clientSecret: env("GMAIL_CLIENT_SECRET"),
          refreshToken: env("GMAIL_REFRESH_TOKEN"),
        },
      },
      settings: {
        defaultFrom: env("EMAIL_FROM"),
        defaultReplyTo: env("EMAIL_REPLY_TO"),
      },
    },
  },
});
