const redis = require("redis");

const client = redis.createClient({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
});

client.on("error", (err) => {
  console.error("Redis error:", err);
});

client.on("connect", () => {
  console.log("Connected to Redis");
});

// this willConnect if not already connected
if (!client.isOpen) {
  client.connect().catch(console.error);
}

module.exports = client;
