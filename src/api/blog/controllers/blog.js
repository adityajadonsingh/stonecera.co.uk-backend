"use strict";

module.exports = {
  async find(ctx) {
    try {
      const page = Math.max(parseInt(ctx.query.page || "1", 10), 1);
      const limit = Math.min(parseInt(ctx.query.limit || "12", 10), 50);
      const start = (page - 1) * limit;

      const [blogs, total] = await Promise.all([
        strapi.entityService.findMany("api::blog.blog", {
          populate: {
            cover_image: {
              fields: ["url", "alternativeText"],
            },
            seo: true,
          },
          sort: { publishedAt: "desc" },
          publicationState: "live",
          limit,
          start,
        }),
        strapi.entityService.count("api::blog.blog", {
          publicationState: "live",
        }),
      ]);

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
