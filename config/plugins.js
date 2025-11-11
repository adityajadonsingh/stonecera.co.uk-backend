// backend/config/plugins.ts
export default ({ env }) => ({
  email: {
    config: {
      provider: "@strapi/provider-email-nodemailer", // Strapi resolves to '@strapi/provider-email-smtp'
      providerOptions: {
        host: env("SMTP_HOST", "smtp.gmail.com"),
        port: env.int("SMTP_PORT", 587),
        secure: env.bool("SMTP_SECURE", false), // true for port 465
        auth: {
          user: env("SMTP_USERNAME"),
          pass: env("SMTP_PASSWORD"), // the Gmail App Password (16 chars)
        },
        defaultFrom: env("EMAIL_FROM", env("SMTP_USERNAME")),
        defaultReplyTo: env("EMAIL_REPLY_TO", env("SMTP_USERNAME")),
      },
      settings: {
        defaultFrom: env("EMAIL_FROM", env("SMTP_USERNAME")),
        defaultReplyTo: env("EMAIL_REPLY_TO", env("SMTP_USERNAME")),
      },
    },
  },
}); 