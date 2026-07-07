'use strict';

/**
 * finish service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::finish.finish');
