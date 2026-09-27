const crypto = require("crypto");
const { pool } = require("../config/db");

// MySQL row -> application account object.
const map = r => r ? {
  _id: r.id,
  user: r.user_id,
  status: r.status,
  currency: r.currency,
  createdAt: r.created_at,
  updatedAt: r.updated_at
} : null;

async function create({ user }, client = pool) {
  const id = crypto.randomUUID();

  await client.execute(
    "INSERT INTO accounts(id,user_id) VALUES(?,?)",
    [id, user]
  );

  const [rows] = await client.execute(
    "SELECT * FROM accounts WHERE id=?",
    [id]
  );

  return map(rows[0]);
}

async function find({ user }, client = pool) {
  const [rows] = await client.execute(
    "SELECT * FROM accounts WHERE user_id=? ORDER BY created_at DESC",
    [user]
  );

  return rows.map(map);
}

// Dynamic WHERE conditions ke liye ? placeholders use karte hain.
// Ye MySQL prepared statements hain.
async function findOne({ _id, user }, client = pool) {
  const conditions = [];
  const values = [];

  if (_id) {
    values.push(_id);
    conditions.push("id=?");
  }

  if (user) {
    values.push(user);
    conditions.push("user_id=?");
  }

  if (!conditions.length) return null;

  const [rows] = await client.execute(
    `SELECT * FROM accounts WHERE ${conditions.join(" AND ")} LIMIT 1`,
    values
  );

  return map(rows[0]);
}

// FOR UPDATE MySQL mein current transaction ke andar row-level lock leta hai.
// Doosri transaction same row ko lock karne se pehle wait karegi.
async function findByIdForUpdate(id, client) {
  const [rows] = await client.execute(
    "SELECT * FROM accounts WHERE id=? FOR UPDATE",
    [id]
  );

  return map(rows[0]);
}

// Balance ledger se calculate hota hai:
// Balance = Total CREDIT - Total DEBIT
async function getBalance(id, client = pool) {
  const [rows] = await client.execute(
    `SELECT COALESCE(
       SUM(CASE WHEN type='CREDIT' THEN amount ELSE -amount END),
       0
     ) AS balance
     FROM ledger
     WHERE account_id=?`,
    [id]
  );

  return Number(rows[0].balance);
}

module.exports = {
  create,
  find,
  findOne,
  findByIdForUpdate,
  getBalance
};