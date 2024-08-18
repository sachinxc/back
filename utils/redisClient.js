const redis = require("redis");

// Use the full URL if available, or fall back to host/port configuration
const redisUrl =
  process.env.REDIS_URL ||
  `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`;

const client = redis.createClient({
  url: redisUrl,
});

client.on("error", (err) => {
  console.error("Redis error:", err);
});

client.on("connect", () => {
  console.log("Connected to Redis");
});

// Connect to Redis (ensure this is handled asynchronously)
client.connect().catch(console.error);

module.exports = client;
