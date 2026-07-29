const { transformVariantCard } = require("./product-variant-transformer");

const getOtherVariants = async (strapi, productId, currentVariantId) => {
  const variants = await strapi
    .documents("api::product-variant.product-variant")
    .findMany({
      filters: {
        product: {
          id: productId,
        },

        id: {
          $ne: currentVariantId,
        },
      },

      populate: {
        images: true,

        category: {
          fields: ["id", "categoryDiscount"],
        },

        product: {
          fields: ["id", "documentId", "name", "slug"],
        },

        size: true,
        thickness: true,
        finish: true,
        color: true,
        labels: true,
      },

      sort: {
        sortOrder: "asc",
      },
    });

  if (variants.length === 0) {
    return null;
  }

  return variants.map(transformVariantCard);
};

const getVariantBySlug = async (strapi, slug) => {
  return await strapi
    .documents("api::product-variant.product-variant")
    .findFirst({
      filters: {
        slug,
      },

      populate: {
        // Product Variant Images
        images: true,

        // Category (for breadcrumbs & related variants)
        category: {
          fields: ["id", "documentId", "name", "slug", "categoryDiscount"],
        },

        // Product (only needed to fetch sibling variants)
        product: {
          fields: ["id", "documentId"],
          populate: {
            images: true,
          },
        },

        // Attributes
        size: true,
        thickness: true,
        finish: true,
        color: true,
        labels: true,

        // SEO
        seo: {
          populate: {
            og_image: true,
            twitter_image: true,
          },
        },
      },
    });
};

const getRelatedVariants = async (
  strapi,
  categoryId,
  productId,
  currentVariantId,
) => {
  const variants = await strapi
    .documents("api::product-variant.product-variant")
    .findMany({
      filters: {
        category: {
          id: categoryId,
        },

        product: {
          id: {
            $ne: productId,
          },
        },

        id: {
          $ne: currentVariantId,
        },
      },

      populate: {
        images: true,

        category: {
          fields: ["id", "categoryDiscount"],
        },

        product: {
          fields: ["id", "documentId", "name", "slug"],
          populate: {
            images: true,
          },
        },

        size: true,
        thickness: true,
        finish: true,
        color: true,
        labels: true,
      },

      sort: [
        {
          stock: "desc",
        },
        {
          sortOrder: "asc",
        },
      ],

      limit: 4,
    });

  return variants.map(transformVariantCard);
};

const buildBreadcrumbs = (variant) => {
  return [
    {
      title: "Home",
      url: "/",
    },
    {
      title: variant.category.name,
      url: `/product-category/${variant.category.slug}`,
    },
    {
      title: variant.name,
      url: null,
    },
  ];
};

module.exports = {
  getVariantBySlug,
  getOtherVariants,
  getRelatedVariants,
  buildBreadcrumbs,
};
