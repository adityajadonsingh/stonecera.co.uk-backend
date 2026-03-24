"use strict";

const getIP = (ctx) => {
  const headers = ctx.request.header;

  const cfIP = headers["cf-connecting-ip"];
  if (cfIP) return cfIP;

  const forwarded = headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();

  const realIP = headers["x-real-ip"];
  if (realIP) return realIP;

  return ctx.request.ip || "unknown";
};

module.exports = {
  async create(ctx) {
    try {
      const {
        name,
        email,
        phone,
        message,
        page,
        website,
        client_ip,
        country_code,
      } = ctx.request.body || {};

      /* ---------- BASIC VALIDATION ---------- */
      if (!name || !email || !message) {
        return ctx.badRequest("Missing required fields");
      }

      const ip = client_ip || getIP(ctx);

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
      console.log("HEADERS:", ctx.request.header);
      console.log("IP:", ctx.request.ip);
      console.log("X-Forwarded-For:", ctx.request.header["x-forwarded-for"]);
      console.log("X-Real-IP:", ctx.request.header["x-real-ip"]);
      console.log("CF-IP:", ctx.request.header["cf-connecting-ip"]);
      console.log("FINAL IP:", ip);
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
            country_code: country_code || null,
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
