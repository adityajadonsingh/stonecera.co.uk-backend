// FILE: backend/src/api/order/controllers/order.js
"use strict";

/**
 * Order controller with server-side validation for stock and price.
 * - POST /orders/checkout: Validates items, stock, and calculates price on the server before creating an order.
 * - GET  /orders: Lists orders for the authenticated user.
 * - GET  /orders/:id: Finds a single order for the authenticated user.
 */

// --- Helper Functions ---

function isObject(x) {
  return x !== null && typeof x === "object";
}

function entityToPlain(obj) {
  if (!obj) return null;
  if (Array.isArray(obj)) return obj.map(entityToPlain).flat();
  if (isObject(obj) && isObject(obj.attributes)) {
    return Object.assign({ id: obj.id ?? obj.attributes.id }, obj.attributes);
  }
  return obj;
}

function ensureArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(entityToPlain);
  if (isObject(val) && Array.isArray(val.data))
    return val.data.map(entityToPlain);
  if (isObject(val)) return [entityToPlain(val)];
  return [];
}

function makeAbsoluteUrl(path) {
  if (!path) return null;
  if (typeof path !== "string") return null;
  if (path.startsWith("http")) return path;
  const base =
    (strapi?.config?.get && strapi.config.get("server.url")) ||
    process.env.STRAPI_API_URL ||
    `http://localhost:${process.env.PORT || 1337}`;
  return `${String(base).replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function getFirstImageFromProduct(productPlain) {
  if (!productPlain) return null;
  const images = ensureArray(productPlain.images);
  if (images.length > 0) {
    const firstImage = images[0];
    if (firstImage && typeof firstImage.url === "string") {
      return makeAbsoluteUrl(firstImage.url);
    }
  }
  return null;
}

function findVariationFromProduct(productPlain, variationId) {
  if (!productPlain) return null;
  const raw =
    productPlain.variations ??
    productPlain.variation ??
    (productPlain.attributes &&
      (productPlain.attributes.variations ??
        productPlain.attributes.variation)) ??
    null;
  const list = ensureArray(raw);
  const target = String(variationId ?? "");
  for (const v of list) {
    const vp = entityToPlain(v) ?? v ?? {};
    const vid = String(vp.uuid ?? vp.id ?? vp.ID ?? "");
    if (vid === target) return v;
  }
  return null;
}

function computeVariationUnitPrice(variation) {
  if (!variation) return 0;
  const vp = entityToPlain(variation) ?? variation;
  const price = Number(
    vp.Price ?? vp.price ?? vp.unit_price ?? vp.unitPrice ?? NaN
  );
  if (Number.isFinite(price)) return price;

  const per = Number(vp.Per_m2 ?? vp.per_m2 ?? 0) || 0;
  const pack = Number(vp.PackSize ?? vp.packSize ?? vp.pack_size ?? 0) || 0;
  if (per && pack) return Number((per * pack).toFixed(2));

  return 0;
}

// --- Controller Actions ---

module.exports = {
  /**
   * Creates a new order after validating items, stock, and calculating prices.
   */
  async checkout(ctx) {
    try {
      const body = ctx.request.body ?? {};
      const frontendItems = Array.isArray(body.items) ? body.items : [];
      if (!frontendItems.length) {
        return ctx.badRequest("No items to checkout");
      }

      const shipping = isObject(body.shipping) ? body.shipping : {};
      const totalsFromFrontend = isObject(body.totals) ? body.totals : {};
      const user = ctx.state.user ?? null;
      const contact = isObject(body.contact) ? body.contact : {};
      const shippingAddress = isObject(body.shippingAddress)
        ? body.shippingAddress
        : {};
      const validatedItems = [];
      let calculatedSubtotal = 0;

      for (const item of frontendItems) {
        if (!isObject(item)) continue;

        const productId =
          typeof item.product === "number"
            ? item.product
            : (item.product?.id ?? null);
        if (!productId) {
          return ctx.badRequest("Each item must have a product ID.");
        }

        // 1. Fetch the full product with its variations and images explicitly populated
        const product = await strapi.entityService.findOne(
          "api::product.product",
          productId,
          {
            populate: { variation: true, images: true },
          }
        );
        if (!product) {
          return ctx.badRequest(`Product with ID ${productId} not found.`);
        }

        // 2. Find the correct variation within the product
        const variationId = item.variation_id ?? item.uuid ?? null;
        const variation = findVariationFromProduct(product, variationId);
        if (!variation) {
          return ctx.badRequest(
            `Variation ID ${variationId} not found for product ${productId}.`
          );
        }
        const vp = entityToPlain(variation) ?? variation;

        // 3. Validate stock
        const stock = Number(vp.Stock ?? vp.stock ?? 0);
        const quantity = Number(item.quantity ?? 1);
        if (quantity > stock) {
          return ctx.badRequest(
            `Not enough stock for product ${product.name}. Requested: ${quantity}, Available: ${stock}.`
          );
        }

        // 4. Calculate price on the server
        const unit_price = computeVariationUnitPrice(variation);
        const subtotal = Number((unit_price * quantity).toFixed(2));
        calculatedSubtotal += subtotal;

        // 5. Build the validated item for the order component
        validatedItems.push({
          product: productId,
          product_name: product.name,
          variation_id: String(vp.id ?? variationId),
          sku: vp.SKU ?? vp.sku ?? null,
          quantity,
          unit_price,
          subtotal,
        });
      }

      // Calculate final total on the server
      const shippingCost = Number(totalsFromFrontend.shippingCost ?? 0);
      const tailLiftCost = Number(totalsFromFrontend.tailLift ?? 0);
      const serverTotal = Number(
        (calculatedSubtotal + shippingCost + tailLiftCost).toFixed(2)
      );

      // Create the order
      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
      const data = {
        orderNumber,
        items: validatedItems,
        shipping,
        totals: {
          ...totalsFromFrontend, // Keep client-side totals for reference
          cartSubtotal: Number(calculatedSubtotal.toFixed(2)),
          total: serverTotal, // Overwrite with server-calculated total
        },
        contact, 
        shipping_address: shippingAddress,
        status: "pending",
        metadata: {
          createdFrom: "frontend",
          ip: ctx.request.ip,
        },
      };

      if (user) {
        data.user = user.id;
      }

      const createdOrder = await strapi.entityService.create(
        "api::order.order",
        {
          data,
        }
      );

      // TODO: Decrement stock here if desired

      return ctx.send(createdOrder);
    } catch (err) {
      strapi.log.error("order.checkout error", err);
      return ctx.internalServerError("Server error");
    }
  },

  /**
   * Lists orders for the currently authenticated user.
   */
  async find(ctx) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized();

      const orders = await strapi.entityService.findMany("api::order.order", {
        filters: { user: user.id },
        populate: { items: { populate: ["product"] } }, // Also populate the product within each item
        sort: { createdAt: "desc" },
      });

      return ctx.send(orders);
    } catch (err) {
      strapi.log.error("order.find error", err);
      return ctx.internalServerError("Server error");
    }
  },

  /**
   * Finds a single order for the authenticated user, ensuring ownership.
   */
  async findOne(ctx) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized();

      const { id } = ctx.params;
      const order = await strapi.entityService.findOne("api::order.order", id, {
        populate: true,
      });
      if (!order) return ctx.notFound();

      if (String(order.user?.id) !== String(user.id)) {
        return ctx.unauthorized("You are not the owner of this order.");
      }

      return ctx.send(order);
    } catch (err) {
      strapi.log.error("order.findOne error", err);
      return ctx.internalServerError("Server error");
    }
  },
};
