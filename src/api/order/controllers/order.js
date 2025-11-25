// File: src/api/order/controllers/order.js

"use strict";

/**
 * Order controller with server-side validation for stock and price.
 * - POST /orders/checkout: Validates items, stock, and calculates price on the server before creating an order.
 * - Automatically decrements variation stock after successful checkout (component-based variations).
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
  return `${String(base).replace(/\/$/, "")}${
    path.startsWith("/") ? path : `/${path}`
  }`;
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
   * Also decrements variation stock after order creation.
   */

  // NEW: createStripeSession controller
  async createStripeSession(ctx) {
    const Stripe = require("stripe").Stripe;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    try {
      const { orderId } = ctx.request.body;

      if (!orderId) {
        return ctx.badRequest("orderId is required");
      }

      // Fetch order
      const order = await strapi.entityService.findOne(
        "api::order.order",
        orderId,
        { populate: { items: true } }
      );

      if (!order) {
        return ctx.notFound("Order not found");
      }

      // Create Checkout Session
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        success_url: `${process.env.FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/checkout/cancel`,
        metadata: {
          orderId: orderId,
        },
        line_items: order.items.map((item) => ({
          price_data: {
            currency: "gbp",
            product_data: {
              name: item.product_name,
            },
            unit_amount: Math.round(item.unit_price * 100),
          },
          quantity: item.quantity,
        })),
      });

      return ctx.send({ sessionId: session.id });
    } catch (err) {
      console.error("❌ Stripe session creation failed:", err);
      return ctx.internalServerError("Failed to create checkout session");
    }
  },
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

      // 1️⃣ Validate and compute all items
      for (const item of frontendItems) {
        if (!isObject(item)) continue;

        const productId =
          typeof item.product === "number"
            ? item.product
            : (item.product?.id ?? null);
        if (!productId) {
          return ctx.badRequest("Each item must have a product ID.");
        }

        // Fetch product with variations and images
        const product = await strapi.entityService.findOne(
          "api::product.product",
          productId,
          { populate: { variation: true, images: true } }
        );
        if (!product) {
          return ctx.badRequest(`Product with ID ${productId} not found.`);
        }

        // Find matching variation
        const variationId = item.variation_id ?? item.uuid ?? null;
        const variation = findVariationFromProduct(product, variationId);
        if (!variation) {
          return ctx.badRequest(
            `Variation ID ${variationId} not found for product ${productId}.`
          );
        }
        const vp = entityToPlain(variation) ?? variation;

        // Check stock (Stock field is capitalized)
        const stock = Number(vp.Stock ?? vp.stock ?? 0);
        const quantity = Number(item.quantity ?? 1);
        if (quantity > stock) {
          return ctx.badRequest(
            `Not enough stock for ${product.name}. Requested: ${quantity}, Available: ${stock}.`
          );
        }

        // Compute server-side pricing
        const unit_price = computeVariationUnitPrice(variation);
        const subtotal = Number((unit_price * quantity).toFixed(2));
        calculatedSubtotal += subtotal;

        validatedItems.push({
          product: productId,
          product_name: product.name,
          variation_id: String(vp.uuid ?? vp.id ?? variationId),
          sku: vp.SKU ?? vp.sku ?? null,
          quantity,
          unit_price,
          subtotal,
        });
      }

      // 2️⃣ Calculate total
      const shippingCost = Number(totalsFromFrontend.shippingCost ?? 0);
      const tailLiftCost = Number(totalsFromFrontend.tailLift ?? 0);
      const serverTotal = Number(
        (calculatedSubtotal + shippingCost + tailLiftCost).toFixed(2)
      );

      // 3️⃣ Create the order
      const orderNumber = `ORD-${Date.now()}-${Math.floor(
        Math.random() * 9000 + 1000
      )}`;
      const data = {
        orderNumber,
        items: validatedItems,
        shipping,
        totals: {
          ...totalsFromFrontend,
          cartSubtotal: Number(calculatedSubtotal.toFixed(2)),
          total: serverTotal,
        },
        contact,
        shipping_address: shippingAddress,
        status: "pending",
        metadata: {
          createdFrom: "frontend",
          ip: ctx.request.ip,
        },
      };

      if (user) data.user = user.id;

      const createdOrder = await strapi.entityService.create(
        "api::order.order",
        { data }
      );

      // 4️⃣ Decrement stock for each variation purchased (component-based variations)
      // We'll update the product entity's `variation` component array replacing the changed item(s).
      for (const item of validatedItems) {
        try {
          // Re-fetch the product to get the latest variation array
          const product = await strapi.entityService.findOne(
            "api::product.product",
            item.product,
            { populate: { variation: true } }
          );
          if (!product) {
            strapi.log.error(
              `Product ${item.product} not found while updating stock.`
            );
            continue;
          }

          const rawVariations = product.variation ?? [];
          // ensure plain array of variations
          const plainVariations = ensureArray(rawVariations);

          // Find matching variation index by uuid or id
          const targetId = String(item.variation_id ?? "");
          let matched = false;
          const updatedVariations = plainVariations.map((v) => {
            const vp = entityToPlain(v) ?? v ?? {};
            const vid = String(vp.uuid ?? vp.id ?? "");
            if (vid === targetId) {
              matched = true;
              const oldStock = Number(vp.Stock ?? vp.stock ?? 0);
              const newStock = Math.max(
                0,
                oldStock - Number(item.quantity ?? 0)
              );
              // Return a new object with updated Stock (respect original keys)
              return { ...vp, Stock: newStock };
            }
            return vp;
          });

          if (!matched) {
            strapi.log.warn(
              `Variation ${item.variation_id} not found inside product ${item.product} when decrementing stock.`
            );
            continue;
          }

          // Persist the updated variations back to the product (component update)
          await strapi.entityService.update(
            "api::product.product",
            item.product,
            {
              data: { variation: updatedVariations },
            }
          );

          strapi.log.info(
            `🟢 Stock updated (product ${item.product}) variation ${item.variation_id}`
          );
        } catch (err) {
          strapi.log.error(
            "❌ Failed to update variation stock (component):",
            err
          );
        }
      }

      return ctx.send(createdOrder);
    } catch (err) {
      strapi.log.error("order.checkout error", err);
      return ctx.internalServerError("Server error");
    }
  },

  async find(ctx) {
    const { user } = ctx.state;

    const entity = await strapi.db.query("api::order.order").findMany({
      where: { user: user?.id },
      populate: {
        items: {
          populate: {
            product: {
              populate: {
                variation: true,
                images: true,
                thumbnail: true,
              },
            },
          },
        },
      },
    });

    const sanitizedOrders = entity.map((order) => ({
      ...order,
      items: order.items.map((item) => {
        const product = item.product;

        // Find the matching variation
        const variation = product?.variations?.find(
          (v) => v.uuid === Number(item.variation_id)
        );

        // Clean text prefixes like “THICKNESS ” and “SIZE ”
        const cleanText = (text) =>
          typeof text === "string"
            ? text.replace(/^THICKNESS\s*/i, "").replace(/^SIZE\s*/i, "")
            : text;

        return {
          id: item.id,
          product_name: item.product_name,
          sku: item.sku,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
          product: {
            id: product?.id,
            name: product?.title || product?.name,
            image: product?.thumbnail?.url || null,
          },
          variation: variation
            ? {
                uuid: variation.uuid,
                SKU: variation.SKU,
                Stock: variation.Stock,
                Thickness: cleanText(variation.Thickness),
                Size: cleanText(variation.Size),
                Finish: variation.Finish,
                ColorTone: variation.ColorTone,
                Price: variation.Price,
                Per_m2: variation.Per_m2,
              }
            : null,
        };
      }),
    }));

    return sanitizedOrders;
  },

  async findOne(ctx) {
    const { id } = ctx.params;

    const entity = await strapi.db.query("api::order.order").findOne({
      where: { id: Number(id) },
      populate: {
        items: {
          populate: {
            product: {
              populate: {
                variation: true,
                images: true,
                thumbnail: true,
              },
            },
          },
        },
      },
    });

    if (!entity) {
      return ctx.notFound("Order not found");
    }

    const sanitizedOrder = {
      ...entity,
      items: entity.items.map((item) => {
        const product = item.product;

        const variation = product?.variation?.find(
          (v) => Number(v.uuid) === Number(item.variation_id)
        );

        const cleanText = (text) =>
          typeof text === "string"
            ? text.replace(/^THICKNESS\s*/i, "").replace(/^SIZE\s*/i, "")
            : text;

        return {
          id: item.id,
          product_name: item.product_name,
          sku: item.sku,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,

          product: {
            id: product?.id,
            name: product?.title || product?.name,
            thumbnail: product?.thumbnail?.url || null,
            images: product?.images?.map((img) => img?.url) || [],
          },

          variation: variation
            ? {
                uuid: variation.uuid,
                SKU: variation.SKU,
                Stock: variation.Stock,
                Thickness: cleanText(variation.Thickness),
                Size: cleanText(variation.Size),
                Finish: variation.Finish,
                ColorTone: variation.ColorTone,
                Price: variation.Price,
                Per_m2: variation.Per_m2,
              }
            : null,
        };
      }),
    };

    return sanitizedOrder;
  },
};
