'use strict';

module.exports = {
  routes: [
    {
      method: 'PUT',
      path: '/products/:productId/update-variation',
      handler: 'custom-product.updateVariation',
      config: {
        auth: false,
      },
    },
  ],
};
