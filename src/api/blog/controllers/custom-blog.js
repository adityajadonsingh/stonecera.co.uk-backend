"use strict";

module.exports = {
  async findOne(ctx) {
    try {
      const { slug } = ctx.params;

      /* ---------------- MAIN BLOG ---------------- */
      const blogs = await strapi.entityService.findMany(
        "api::blog.blog",
        {
          filters: { slug },
          populate: {
            cover_image: {
              fields: ["url", "alternativeText"],
            },
            seo: true,
          },
          publicationState: "live",
          limit: 1,
        }
      );

      if (!blogs || !blogs.length) {
        return ctx.notFound("Blog not found");
      }

      const blog = blogs[0];

      /* ---------------- RECENT BLOGS (EXCLUDE CURRENT) ---------------- */
      const recentBlogsRaw = await strapi.entityService.findMany(
        "api::blog.blog",
        {
          filters: {
            slug: { $ne: slug },
          },
          populate: {
            cover_image: {
              fields: ["url", "alternativeText"],
            },
          },
          sort: { createdAt: "desc" },
          publicationState: "live",
          limit: 3,
        }
      );

      /* ---------------- RESPONSE SHAPE ---------------- */
      return {
        blog: {
          id: blog.id,
          title: blog.title || "",
          slug: blog.slug,
          shortDescription: blog.short_description || "",
          content: blog.content || "",
          author: blog.author_name || "",
          createdOn: blog.uploaded_date
            ? new Date(blog.uploaded_date).toISOString().split("T")[0]
            : new Date(blog.createdAt).toISOString().split("T")[0],
          image: blog.cover_image
            ? {
                url: blog.cover_image.url,
                alt: blog.cover_image.alternativeText || blog.title,
              }
            : null,
          seo: blog.seo || null,
        },

        recentBlogs: (recentBlogsRaw || []).map((b) => ({
          title: b.title || "",
          slug: b.slug,
          image: b.cover_image
            ? {
                url: b.cover_image.url,
                alt: b.cover_image.alternativeText || b.title,
              }
            : null,
        })),
      };
    } catch (err) {
      strapi.log.error("Blog detail fetch error", err);
      return ctx.internalServerError("Failed to fetch blog");
    }
  },
};
