import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default {
  async handle(ctx) {
    const sig = ctx.request.headers["stripe-signature"];

    // The RAW UNPARSED BODY
    const rawBody =
      ctx.request.body[Symbol.for("unparsedBody")] || ctx.request.body;

    console.log(
      "RAW TYPE:",
      typeof rawBody,
      "IS BUFFER?",
      Buffer.isBuffer(rawBody)
    );

    try {
      const event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      console.log("🔥 VERIFIED:", event.type);

      ctx.body = { received: true };
    } catch (err) {
      console.error("❌ Webhook verification error:", err.message);

      ctx.status = 400;
      return (ctx.body = `Webhook error: ${err.message}`);
    }
  },
};
