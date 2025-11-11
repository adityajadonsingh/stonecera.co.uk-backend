"use strict";

/**
 * Cart controller (DB-backed) - returns minimal cart item payload including:
 * - id, quantity, unit_price
 * - product: { id, name, slug, image }
 * - variation: { id, stock } (nullable)
 *
 * This version attempts to populate the product.variation component (and images).
 * If the populate attempt fails (different schema), it falls back to populate: true.
 */

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

function getFirstImageFromProduct(productPlain, metadata) {
  if (!productPlain) return null;

  // 1) direct images array
  if (Array.isArray(productPlain.images) && productPlain.images.length) {
    const first = productPlain.images[0];
    if (isObject(first) && typeof first.url === "string")
      return makeAbsoluteUrl(first.url);
    if (
      isObject(first) &&
      isObject(first.attributes) &&
      typeof first.attributes.url === "string"
    )
      return makeAbsoluteUrl(first.attributes.url);
  }

  // 2) nested shapes
  try {
    if (isObject(productPlain.attributes)) {
      const imgs =
        productPlain.attributes.images ?? productPlain.attributes.image ?? null;
      if (imgs) {
        if (isObject(imgs) && Array.isArray(imgs.data) && imgs.data.length) {
          const first = imgs.data[0];
          const url = first?.attributes?.url ?? first?.url ?? null;
          if (typeof url === "string") return makeAbsoluteUrl(url);
        }
        if (Array.isArray(imgs) && imgs.length) {
          const f = imgs[0];
          if (isObject(f) && typeof f.url === "string")
            return makeAbsoluteUrl(f.url);
        }
      }
    }
  } catch (e) {
    // ignore
  }

  // 3) metadata fallback
  if (isObject(metadata)) {
    const metaImg =
      metadata.productImage ?? metadata.product_image ?? metadata.image ?? null;
    if (typeof metaImg === "string") return makeAbsoluteUrl(metaImg);
    if (isObject(metaImg) && typeof metaImg.url === "string")
      return makeAbsoluteUrl(metaImg.url);
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

function findVariationBySKU(productPlain, sku) {
  if (!productPlain || !sku) return null;
  const raw =
    productPlain.variations ??
    productPlain.variation ??
    (productPlain.attributes &&
      (productPlain.attributes.variations ??
        productPlain.attributes.variation)) ??
    null;
  const list = ensureArray(raw);
  const target = String(sku).trim();
  for (const v of list) {
    const vp = entityToPlain(v) ?? v ?? {};
    const s = vp.SKU ?? vp.sku ?? vp.code ?? null;
    if (s !== undefined && s !== null && String(s).trim() === target) return v;
  }
  return null;
}

function getVariationStock(variation) {
  if (!variation) return null;
  const vp = entityToPlain(variation) ?? variation;
  const stock =
    Number(
      vp.Stock ??
        vp.stock ??
        vp.StockQty ??
        vp.stockQty ??
        vp.stock_quantity ??
        vp.availableStock ??
        vp.available_stock ??
        0
    ) || 0;
  return { id: vp.id ?? null, stock };
}

// Build the product populate descriptor to request variation & images if present.
// We'll try this and fall back to populate: true if Strapi rejects any key.
function getProductPopulateDescriptor() {
  // Attempt to detect attributes and request only valid ones
  try {
    const ct =
      strapi.contentTypes && strapi.contentTypes["api::product.product"];
    const attrs = ct && ct.attributes ? ct.attributes : {};
    const fields = [];
    if (attrs.images) fields.push("images");
    if (attrs.variation) fields.push("variation");
    // if (attrs.variations) fields.push("variations");
    if (fields.length) return { product: { populate: fields } };
    // no specific fields detected
    return { product: true };
  } catch (e) {
    return { product: true };
  }
}

module.exports = {
  // POST /api/cart/add
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

      // populate product fully (we will request variation via populate above in find; here we fetch product fully)
      const product = await strapi.entityService.findOne(
        "api::product.product",
        productId,
        {
          populate: ["images", "variation"],
        }
      );

      if (!product) return ctx.badRequest("Product not found");

      const variation = findVariationFromProduct(product, variation_id);
      if (!variation)
        return ctx.badRequest("Variation not found for this product");

      const vp = entityToPlain(variation) ?? variation;
      const unitPrice =
        Number(vp.Price ?? vp.price ?? vp.unit_price ?? vp.unitPrice ?? 0) || 0;

      const created = await strapi.entityService.create("api::cart.cart", {
        data: {
          user: user.id,
          uuid: Number(variation_id),
          quantity: Number(quantity),
          unit_price: unitPrice,
          product: productId,
          metadata: {
            productName: (entityToPlain(product)?.name ?? product.name) || null,
            productImage: getFirstImageFromProduct(
              entityToPlain(product) ?? product,
              null
            ),
            sku: vp?.SKU ?? vp?.sku ?? null,
          },
        },
      });

      return ctx.send(created);
    } catch (err) {
      strapi.log.error("cart.add error", err);
      return ctx.internalServerError("Server error");
    }
  },

  // GET /api/cart -> minimal result with product.image + variation.stock
  async find(ctx) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized();

      const populateDescriptor = getProductPopulateDescriptor();
      let items;
      try {
        items = await strapi.entityService.findMany("api::cart.cart", {
          filters: { user: user.id },
          populate: populateDescriptor,
        });
      } catch (err) {
        strapi.log.warn(
          "cart.find: populate descriptor failed, falling back to populate: { product: true }",
          err
        );
        items = await strapi.entityService.findMany("api::cart.cart", {
          filters: { user: user.id },
          populate: { product: true },
        });
      }

      const mapped = (items || []).map((entry) => {
        const e = entityToPlain(entry) ?? entry;
        const productEntity = e.product ?? null;
        const productPlain =
          entityToPlain(productEntity) ?? productEntity ?? null;

        const variationUuid = String(
          e.uuid ?? e.variation_id ?? e.variationId ?? ""
        );
        const rawVariations =
          productPlain.variation ??
          productPlain.variations ??
          productPlain.attributes?.variation ??
          productPlain.attributes?.variations ??
          [];

        const variationsArray = ensureArray(rawVariations);
        let variationMatch = variationsArray.find(
          (v) => String(v.uuid ?? v.id ?? "") === variationUuid
        );

        // fallback: by SKU
        if (!variationMatch && isObject(e.metadata) && e.metadata.sku) {
          variationMatch = variationsArray.find(
            (v) =>
              String(v.sku ?? v.SKU ?? "").trim() ===
              String(e.metadata.sku).trim()
          );
        }

        // build stock info
        const stockValue = Number(
          variationMatch?.stock ??
            variationMatch?.Stock ??
            variationMatch?.availableStock ??
            variationMatch?.available_stock ??
            0
        );

        const productMin = {
          id: productPlain?.id ?? null,
          name: productPlain?.name ?? productPlain?.attributes?.name ?? null,
          slug: productPlain?.slug ?? productPlain?.attributes?.slug ?? null,
          image: getFirstImageFromProduct(productPlain, e.metadata ?? null),
        };

        return {
          id: e.id ?? null,
          quantity: Number(e.quantity ?? 1),
          unit_price: Number(e.unit_price ?? e.unitPrice ?? 0),
          product: productMin,
          variation: {
            id: variationMatch?.uuid ?? variationMatch?.id ?? null,
            stock: stockValue,
          },
          metadata: e.metadata ?? null,
        };
      });

      return ctx.send(mapped);
    } catch (err) {
      strapi.log.error("cart.find error", err);
      return ctx.internalServerError("Server error");
    }
  },
  // PUT /api/cart/:id -> update quantity (no strict check)
  async update(ctx) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized();

      const { id } = ctx.params;
      const { quantity } = ctx.request.body ?? {};

      if (quantity === undefined) return ctx.badRequest("quantity required");

      const item = await strapi.entityService.findOne("api::cart.cart", id, {
        populate: { product: true, user: true },
      });
      if (!item) return ctx.notFound("Cart item not found");
      if (String(item.user?.id) !== String(user.id))
        return ctx.unauthorized("Not your cart item");

      const updated = await strapi.entityService.update("api::cart.cart", id, {
        data: { quantity: Number(quantity) },
      });

      return ctx.send(updated);
    } catch (err) {
      strapi.log.error("cart.update error", err);
      return ctx.internalServerError("Server error");
    }
  },

  // DELETE /api/cart/:id
  async remove(ctx) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized();

      const { id } = ctx.params;
      const item = await strapi.entityService.findOne("api::cart.cart", id, {
        populate: ["user"],
      });
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
};
