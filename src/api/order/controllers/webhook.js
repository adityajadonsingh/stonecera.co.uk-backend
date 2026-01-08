import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default {
  async handle(ctx) {
    const sig = ctx.request.headers["stripe-signature"];
    const rawBody =
      ctx.request.body[Symbol.for("unparsedBody")] || ctx.request.body;

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("❌ Webhook verification failed:", err.message);
      ctx.status = 400;
      return (ctx.body = "Webhook signature invalid");
    }

    const data = event.data.object;

    // Payment succeeded
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const orderId = session.metadata.orderId;

      await strapi.entityService.update("api::order.order", orderId, {
        data: { status: "paid" },
      });

      console.log("Order marked paid:", orderId);
    }

    // Payment failed
    if (event.type === "checkout.session.async_payment_failed") {
      const orderId = data.metadata?.orderId;

      if (orderId) {
        await strapi.entityService.update("api::order.order", orderId, {
          data: { status: "pending" },
        });

        console.log(`⚠ Payment failed for order ${orderId}`);
      }
    }

    ctx.body = { received: true };
  },
};
