'use strict';

/**
 * site-policy service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::site-policy.site-policy');
