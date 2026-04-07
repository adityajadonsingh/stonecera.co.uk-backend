"use strict";

// Helpers
function makeAbsoluteUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${process.env.STRAPI_API_URL}${path}`;
}

function getProductImage(product, metadata) {
  // from product
  if (product?.images?.length) {
    return makeAbsoluteUrl(product.images[0].url);
  }

  // fallback (important for old cart items)
  if (metadata?.productImage) {
    return makeAbsoluteUrl(metadata.productImage);
  }

  return null;
}

function getVariation(product, variationId) {
  if (!product?.variation?.length) return null;

  return product.variation.find(
    (v) => String(v.uuid) === String(variationId)
  );
}

function buildMetadata(product, variation) {
  return {
    productName: product.name,
    productImage: getProductImage(product, null),

    sku: variation?.SKU ?? null,

    variation: {
      uuid: variation?.uuid ?? null,
      Stock: variation?.Stock ?? 0,
      Thickness: variation?.Thickness ?? null,
      Size: variation?.Size ?? null,
      Finish: variation?.Finish ?? null,
      PackSize: variation?.PackSize ?? null,
      Pcs: variation?.Pcs ?? null,
      ColorTone: variation?.ColorTone ?? null,
      Price: variation?.Price ?? null,
      Per_m2: variation?.Per_m2 ?? null,
    },
  };
}

module.exports = {
  // ADD TO CART
  async add(ctx) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized("You must be logged in");

      const {
        product: productId,
        variation_id,
        quantity = 1,
      } = ctx.request.body ?? {};

      if (!productId || variation_id === undefined || variation_id === null) {
        return ctx.badRequest("product and variation_id are required");
      }

      const product = await strapi.entityService.findOne(
        "api::product.product",
        productId,
        {
          populate: {
            images: true,
            variation: true,
          },
        }
      );

      if (!product) return ctx.badRequest("Product not found");

      const variation = getVariation(product, variation_id);
      if (!variation)
        return ctx.badRequest("Variation not found for this product");

      const unitPrice = Number(variation.Price ?? 0) || 0;

      const existingItems = await strapi.entityService.findMany(
        "api::cart.cart",
        {
          filters: {
            user: user.id,
            product: productId,
            uuid: variation_id,
          },
          limit: 1,
        }
      );

      const metadata = buildMetadata(product, variation);

      let cartItem;

      if (existingItems.length > 0) {
        const existing = existingItems[0];

        cartItem = await strapi.entityService.update(
          "api::cart.cart",
          existing.id,
          {
            data: {
              quantity: Number(existing.quantity) + Number(quantity),
              metadata,
            },
          }
        );
      } else {
        cartItem = await strapi.entityService.create("api::cart.cart", {
          data: {
            user: user.id,
            uuid: variation_id,
            quantity: Number(quantity),
            unit_price: unitPrice,
            product: productId,
            metadata,
          },
        });
      }

      return ctx.send(cartItem);
    } catch (err) {
      strapi.log.error("cart.add error", err);
      return ctx.internalServerError("Server error");
    }
  },

  // GET CART
  async find(ctx) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized();

      const items = await strapi.entityService.findMany(
        "api::cart.cart",
        {
          filters: { user: user.id },
          populate: {
            product: {
              populate: {
                images: true,
                variation: true,
              },
            },
          },
        }
      );

      const mapped = items.map((item) => {
        const product = item.product;
        const variation = getVariation(product, item.uuid);

        return {
          id: item.id,
          quantity: Number(item.quantity ?? 1),
          unit_price: Number(item.unit_price ?? 0),

          product: {
            id: product?.id ?? null,
            name: product?.name ?? null,
            slug: product?.slug ?? null,
            image: getProductImage(product, item.metadata),
          },

          variation: {
            id: variation?.uuid ?? null,
            stock: variation?.Stock ?? 0,
          },

          metadata: {
            ...item.metadata,
            variation: {
              uuid: variation?.uuid ?? null,
              SKU: variation?.SKU ?? null,
              Stock: variation?.Stock ?? 0,
              Thickness: variation?.Thickness ?? null,
              Size: variation?.Size ?? null,
              Finish: variation?.Finish ?? null,
              PackSize: variation?.PackSize ?? null,
              Pcs: variation?.Pcs ?? null,
              ColorTone: variation?.ColorTone ?? null,
              Price: variation?.Price ?? null,
              Per_m2: variation?.Per_m2 ?? null,
            },
          },
        };
      });

      return ctx.send(mapped);
    } catch (err) {
      strapi.log.error("cart.find error", err);
      return ctx.internalServerError("Server error");
    }
  },

  // UPDATE QUANTITY
  async update(ctx) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized();

      const { id } = ctx.params;
      const { quantity } = ctx.request.body ?? {};

      if (quantity === undefined)
        return ctx.badRequest("quantity required");

      const item = await strapi.entityService.findOne(
        "api::cart.cart",
        id,
        {
          populate: { user: true },
        }
      );

      if (!item) return ctx.notFound("Cart item not found");

      if (String(item.user?.id) !== String(user.id))
        return ctx.unauthorized("Not your cart item");

      const updated = await strapi.entityService.update(
        "api::cart.cart",
        id,
        {
          data: { quantity: Number(quantity) },
        }
      );

      return ctx.send(updated);
    } catch (err) {
      strapi.log.error("cart.update error", err);
      return ctx.internalServerError("Server error");
    }
  },

  // REMOVE ITEM
  async remove(ctx) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized();

      const { id } = ctx.params;

      const item = await strapi.entityService.findOne(
        "api::cart.cart",
        id,
        {
          populate: ["user"],
        }
      );

      if (!item) return ctx.notFound("Cart item not found");

      if (String(item.user?.id) !== String(user.id))
        return ctx.unauthorized("Not your cart item");

      await strapi.entityService.delete("api::cart.cart", id);

      return ctx.send({ ok: true });
    } catch (err) {
      strapi.log.error("cart.remove error", err);
      return ctx.internalServerError("Server error");
    }
  },

  // GUEST CART
  async guestCart(ctx) {
    try {
      const items = ctx.request.body?.items || [];

      if (!Array.isArray(items)) {
        return ctx.badRequest("items must be an array");
      }

      const response = [];

      for (const item of items) {
        const { product: productId, variation_id, quantity } = item;

        const product = await strapi.entityService.findOne(
          "api::product.product",
          productId,
          {
            populate: {
              images: true,
              variation: true,
            },
          }
        );

        if (!product) continue;

        const variation = getVariation(product, variation_id);
        if (!variation) continue;

        response.push({
          id: `${productId}-${variation_id}`,
          quantity: Number(quantity ?? 1),
          unit_price: Number(variation.Price ?? 0),

          product: {
            id: product.id,
            name: product.name,
            slug: product.slug,
            image: getProductImage(product, null),
          },

          variation: {
            id: variation?.uuid ?? null,
            stock: variation?.Stock ?? 0,
          },

          metadata: buildMetadata(product, variation),
        });
      }

      return ctx.send(response);
    } catch (err) {
      strapi.log.error("cart.guestCart error", err);
      return ctx.internalServerError("Server error");
    }
  },
};