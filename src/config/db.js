const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

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