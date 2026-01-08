"use strict";

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::footer-detail.footer-detail",
  ({ strapi }) => ({
    async find(ctx) {
      // Fetch singleType → must use findOne
      const data = await strapi.entityService.findOne(
        "api::footer-detail.footer-detail",
        1,
        {
          populate: {
            companyPhoneNumbers: true,
            companyEmails: true,
            companyAddress: true,
          },
        }
      );

      return {
        companyPhoneNumbers: data?.companyPhoneNumbers ?? [],
        companyEmails: data?.companyEmails ?? [],
        companyAddress: data?.companyAddress ?? null,
        facebookLink: data?.facebookLink ?? null,
        twitterLink: data?.twitterLink ?? null,
        instagramLink: data?.instagramLink ?? null,
        linkedinLink: data?.linkedinLink ?? null,
        pinterestLink: data?.pinterestLink ?? null,
      };
    },
  })
);
