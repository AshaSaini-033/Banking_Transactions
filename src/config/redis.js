const Redis = require("ioredis");

// Redis financial data store nahi hai.
// Is project mein Redis ka use distributed locking ke liye ho raha hai.
const redis = new Redis(process.env.REDIS_URL);

redis.on("connect", () => {
  console.log("Redis connected");
});

redis.on("ready", () => {
  console.log("Redis ready");
});

redis.on("error", (error) => {
  console.error("Redis error:", error.message);
});

module.exports = redis;