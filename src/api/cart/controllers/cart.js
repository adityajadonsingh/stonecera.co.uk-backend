"use strict";

/**
 * Enhanced Cart controller:
 * - Includes full product variation details (Size, Thickness, Finish, etc.)
 * - Keeps backward compatibility with existing logic
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
  } catch (e) {}

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
    productPlain.variation ??
    productPlain.variations ??
    (productPlain.attributes &&
      (productPlain.attributes.variation ??
        productPlain.attributes.variations)) ??
    null;
  const list = ensureArray(raw);
  const target = String(variationId ?? "");
  for (const v of list) {
    const vp = entityToPlain(v) ?? v ?? {};
    const vid = String(vp.uuid ?? vp.id ?? vp.ID ?? "");
    if (vid === target) return vp;
  }
  return null;
}

function getProductPopulateDescriptor() {
  try {
    const ct = strapi.contentTypes["api::product.product"];
    const attrs = ct && ct.attributes ? ct.attributes : {};
    const fields = [];
    if (attrs.images) fields.push("images");
    if (attrs.variation) fields.push("variation");
    return { product: { populate: fields } };
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

      const { product: productId, variation_id, quantity = 1 } =
        ctx.request.body ?? {};

      if (!productId || variation_id === undefined || variation_id === null) {
        return ctx.badRequest("product and variation_id are required");
      }

      const product = await strapi.entityService.findOne(
        "api::product.product",
        productId,
        { populate: ["images", "variation"] }
      );
      if (!product) return ctx.badRequest("Product not found");

      const variation = findVariationFromProduct(product, variation_id);
      if (!variation)
        return ctx.badRequest("Variation not found for this product");

      const unitPrice =
        Number(variation.Price ?? variation.price ?? 0) || 0;

      const existingItems = await strapi.entityService.findMany(
        "api::cart.cart",
        {
          filters: {
            user: user.id,
            product: productId,
            uuid: Number(variation_id),
          },
          limit: 1,
        }
      );

      let cartItem;
      const metadata = {
        productName: product.name,
        productImage: getFirstImageFromProduct(product, null),
        sku: variation.SKU ?? null,
        variation: {
          uuid: variation.uuid ?? null,
          Stock: variation.Stock ?? 0,
          Thickness: variation.Thickness ?? null,
          Size: variation.Size ?? null,
          Finish: variation.Finish ?? null,
          PackSize: variation.PackSize ?? null,
          Pcs: variation.Pcs ?? null,
          ColorTone: variation.ColorTone ?? null,
          Price: variation.Price ?? null,
          Per_m2: variation.Per_m2 ?? null,
        },
      };

      if (existingItems.length > 0) {
        const existing = existingItems[0];
        const newQuantity = Number(existing.quantity ?? 0) + Number(quantity);
        cartItem = await strapi.entityService.update(
          "api::cart.cart",
          existing.id,
          { data: { quantity: newQuantity, metadata } }
        );
      } else {
        cartItem = await strapi.entityService.create("api::cart.cart", {
          data: {
            user: user.id,
            uuid: Number(variation_id),
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

  // GET /api/cart
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
        strapi.log.warn("cart.find populate failed, fallback", err);
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
        const variation = findVariationFromProduct(productPlain, variationUuid);

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
            id: variation?.uuid ?? variation?.id ?? null,
            stock: variation?.Stock ?? 0,
          },
          metadata: {
            ...e.metadata,
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
