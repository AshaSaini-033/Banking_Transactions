// MySQL connection pool.
// Pool reusable connections maintain karta hai, isliye har request par
// manually naya database connection create nahi karna padta.
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "banking",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Server start hote waqt simple query se check karte hain
// ki MySQL reachable hai ya nahi.
async function connectDB() {
  try {
    const connection = await pool.getConnection();
    await connection.query("SELECT 1");
    connection.release();
    console.log("Connected to MySQL");
  } catch (error) {
    console.error("Error connecting to MySQL:", error.message);
    process.exit(1);
  }
}

module.exports = { pool, connectDB };