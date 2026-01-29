"use strict";

module.exports = {
  async create(ctx) {
    const { name, email, feedback, stars, product, website } = ctx.request.body;

    /* -------- Honeypot -------- */
    if (website) {
      return ctx.badRequest("Spam detected");
    }

    /* -------- Validation -------- */
    if (!name || !email || !feedback || !stars || !product) {
      return ctx.badRequest("Missing required fields");
    }

    if (stars < 1 || stars > 5) {
      return ctx.badRequest("Stars must be between 1 and 5");
    }

    try {
      const entry = await strapi.entityService.create(
        "api::product-review.product-review",
        {
          data: {
            name,
            email,
            feedback,
            stars,
            product,
            isApproved: false,
          },
        }
      );

      return ctx.send({ ok: true, id: entry.id });
    } catch (err) {
      strapi.log.error("Product review create error", err);
      return ctx.internalServerError("Failed to submit review");
    }
  },
};
