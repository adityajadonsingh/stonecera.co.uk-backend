'use strict';

/**
 * product-catalogue service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::product-catalogue.product-catalogue');
