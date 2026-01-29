"use strict";

async function sendEmail({ to, cc, bcc, subject, html, text }) {
  return await strapi
    .plugin("email")
    .service("email")
    .send({
      to,
      cc,
      bcc,
      subject,
      html,
      text,
    });
}

module.exports = {
  sendEmail,
};
