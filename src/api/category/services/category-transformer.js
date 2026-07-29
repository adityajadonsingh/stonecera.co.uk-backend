const transformImage = (image) => {
  if (!image) return null;

  return {
    url: image.url,
    alt: image.alternativeText || image.name,
  };
};

const transformSeo = (seo) => {
  if (!seo) return null;

  return {
    metaTitle: seo.meta_title,
    metaDescription: seo.meta_description,
    canonical: seo.canonical_tag,
    robots: seo.robots,

    ogTitle: seo.og_title,
    ogDescription: seo.og_description,

    twitterTitle: seo.twitter_title,
    twitterDescription: seo.twitter_description,

    ogImage: transformImage(seo.og_image),
    twitterImage: transformImage(seo.twitter_image),
  };
};

const transformCategory = (category) => {
  return {
    id: category.id,
    documentId: category.documentId,

    name: category.name,
    slug: category.slug,

    shortDescription: category.short_description,
    footerContent: category.footer_content,

    banner: transformImage(category.bannerImg),

    images: category.images?.map(transformImage) || [],

    seo: transformSeo(category.seo),
  };
};

module.exports = {
  transformCategory,
};