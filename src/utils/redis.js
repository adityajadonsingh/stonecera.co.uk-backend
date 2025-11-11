const { createClient } = require("redis");

const url = process.env.REDIS_URL || "redis://:A@@ditya@127.0.0.1:6379";
let client;

async function connect() {
  if (client) return client;
  client = createClient({ url });
  client.on("error", (err) => strapi.log.error("Redis Client Error:", err));
  await client.connect();
  strapi.log.info("Redis connected:", url.replace(/:[^:@]+@/, ":****@"));
  return client;
}

module.exports = { connect };