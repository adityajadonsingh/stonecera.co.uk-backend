"use strict";

module.exports = {
  async find(ctx) {
    try {
      const page = Math.max(parseInt(ctx.query.page || "1", 10), 1);

      const limit = Math.min(parseInt(ctx.query.limit || "12", 10), 50);

      const start = (page - 1) * limit;

      const blogs = await strapi.documents("api::blog.blog").findMany({
        status: "published",

        sort: ["publishedAt:desc"],

        start,
        limit,

        populate: {
          cover_image: {
            fields: ["url", "alternativeText"],
          },
          seo: true,
        },
      });

      const total = await strapi.documents("api::blog.blog").count({
        status: "published",
      });

      return {
        meta: {
          page,
          pageSize: limit,
          total,
          pageCount: Math.ceil(total / limit),
        },

        data: (blogs || []).map((b) => ({
          id: b.id,
          title: b.title || "",
          slug: b.slug,

          shortDescription: b.short_description || "",

          content: b.content || "",

          author: b.author_name || "",

          createdOn: b.uploaded_date
            ? new Date(b.uploaded_date).toISOString().split("T")[0]
            : new Date(b.createdAt).toISOString().split("T")[0],

          image: b.cover_image
            ? {
                url: b.cover_image.url,
                alt: b.cover_image.alternativeText || b.title,
              }
            : null,

          seo: b.seo || null,
        })),
      };
    } catch (err) {
      strapi.log.error("Blog fetch error", err);

      return ctx.internalServerError("Failed to fetch blogs");
    }
  },
};
