const { pool } = require("../config/db");

async function findOne({ token }, client = pool) {
  const [rows] = await client.execute(
    "SELECT * FROM token_blacklist WHERE token=? LIMIT 1",
    [token]
  );

  return rows[0] || null;
}

async function create({ token }, client = pool) {
  // MySQL mein duplicate token par error avoid karne ke liye INSERT IGNORE.
  await client.execute(
    "INSERT IGNORE INTO token_blacklist(token) VALUES(?)",
    [token]
  );

  return findOne({ token }, client);
}

const tokenBlackListModel = { findOne, create };

module.exports = { tokenBlackListModel };