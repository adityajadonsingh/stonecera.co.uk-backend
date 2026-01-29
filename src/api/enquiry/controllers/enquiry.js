"use strict";

module.exports = {
  async create(ctx) {
    try {
      const {
        name,
        email,
        phone,
        message,
        page,
        website, // honeypot
      } = ctx.request.body || {};

      /* ---------- BASIC VALIDATION ---------- */
      if (!name || !email || !message) {
        return ctx.badRequest("Missing required fields");
      }

      const ip =
        ctx.request.ip || ctx.request.header["x-forwarded-for"] || "unknown";

      /* ---------- HONEYPOT ---------- */
      if (website) {
        await strapi.entityService.create("api::enquiry.enquiry", {
          data: {
            name,
            email,
            phone,
            message,
            page,
            ip_address: ip,
            isSpam: true,
          },
        });

        return ctx.send({ success: true });
      }

      /* ---------- RATE LIMIT (1 / MIN / IP) ---------- */
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

      const recent = await strapi.entityService.findMany(
        "api::enquiry.enquiry",
        {
          filters: {
            ip_address: ip,
            createdAt: { $gte: oneMinuteAgo },
          },
          limit: 1,
        },
      );

      if (recent.length > 0) {
        return ctx.badRequest("Please wait before submitting another enquiry");
      }

      /* ---------- CREATE ENQUIRY ---------- */
      const enquiry = await strapi.entityService.create(
        "api::enquiry.enquiry",
        {
          data: {
            name,
            email,
            phone,
            message,
            page,
            ip_address: ip,
            user_agent: ctx.request.header["user-agent"] || "",
            isSpam: false,
            isRead: false,
          },
        },
      );

      /* ---------- EMAILS (ASYNC / NON-BLOCKING) ---------- */
      setImmediate(async () => {
        try {
          const emailService = strapi.plugin("email").service("email");

          await emailService.send({
            to: process.env.ADMIN_EMAIL,
            bcc: process.env.ADMIN_BCC_EMAIL,
            subject: "📩 New Enquiry – Stonecera",
            html: `
        <h2>New Enquiry</h2>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        ${phone ? `<p><b>Phone:</b> ${phone}</p>` : ""}
        <p><b>Message:</b> ${message.replace(/\n/g, "<br/>")}</p>
        <p><b>Page:</b> ${page || "N/A"}</p>
        <p><b>IP:</b> ${ip}</p>
        <hr/>
        <p>${message.replace(/\n/g, "<br/>")}</p>
      `,
          });

          await emailService.send({
            to: email,
            subject: "Thanks for contacting Stonecera",
            html: `
        <p>Hi ${name},</p>
        <p>Thank you for contacting <b>Stonecera</b>.</p>
        <p>We’ve received your enquiry and will respond shortly.</p>
        <br/>
        <p>Stonecera Team</p>
      `,
          });
        } catch (err) {
          strapi.log.error("Enquiry email error", err);
        }
      });

      return ctx.send({
        success: true,
        message: "Enquiry submitted successfully",
      });
    } catch (err) {
      strapi.log.error("Enquiry create error", err);
      return ctx.internalServerError("Server error");
    }
  },
};
