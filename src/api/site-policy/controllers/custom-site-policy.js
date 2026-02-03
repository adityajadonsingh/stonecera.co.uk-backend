"use strict";

module.exports = {
  // GET /api/site-policies/:pageName
  async findByPage(ctx) {
    try {
      const { pageName } = ctx.params;

      const items = await strapi.entityService.findMany(
        "api::site-policy.site-policy",
        {
          filters: {
            pageName,
          },
          publicationState: "live",
          limit: 1,
        }
      );

      if (!items || !items.length) {
        return ctx.notFound("Policy page not found");
      }

      const policy = items[0];

      return {
        pageName: policy.pageName,
        pageDescription: policy.pageDescription,
      };
    } catch (err) {
      strapi.log.error("Site policy fetch error", err);
      return ctx.internalServerError("Failed to fetch policy");
    }
  },
};
