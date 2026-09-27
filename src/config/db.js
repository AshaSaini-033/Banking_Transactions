// PostgreSQL ka connection pool.
// Pool ka matlab: har request par naya DB connection banane ke bajay
// kuch reusable connections maintain hote hain.
const { Pool } = require("pg");

const pool = new Pool({
  // DATABASE_URL .env se aayega.
  connectionString: process.env.DATABASE_URL,

  // Production DB (jaise Render/Neon) SSL maang sakta hai.
  // Local development mein SSL ki zarurat nahi hai.
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});

// Server start hote time ek simple query chala kar
// check kar rahe hain ki PostgreSQL reachable hai ya nahi.
async function connectDB() {
  try {
    await pool.query("SELECT 1");
    console.log("Connected to PostgreSQL");
  } catch (error) {
    console.error("Error connecting to PostgreSQL:", error.message);
    process.exit(1);
  }
}

module.exports = { pool, connectDB };