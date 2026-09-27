const { pool } = require("../config/db");

// PostgreSQL row ko application ke account object mein convert karte hain.
// DB mein snake_case hai, application mein camelCase use kar rahe hain.
const map = r => r ? {
  _id: r.id,
  user: r.user_id,
  status: r.status,
  currency: r.currency,
  createdAt: r.created_at,
  updatedAt: r.updated_at
} : null;

// User ke liye naya bank account create karta hai.
async function create({ user }, client = pool) {
  const { rows } = await client.query(
    "INSERT INTO accounts(user_id) VALUES($1) RETURNING *",
    [user]
  );
  return map(rows[0]);
}

// Logged-in user ke saare accounts nikalta hai.
async function find({ user }, client = pool) {
  const { rows } = await client.query(
    "SELECT * FROM accounts WHERE user_id=$1 ORDER BY created_at DESC",
    [user]
  );
  return rows.map(map);
}

// Account ko ID aur/ya user ke basis par find karta hai.
// $1, $2 parameterized query hain -> SQL injection se safer.
async function findOne({ _id, user }, client = pool) {
  const conditions = [];
  const values = [];

  if (_id) {
    values.push(_id);
    conditions.push(`id=$${values.length}`);
  }

  if (user) {
    values.push(user);
    conditions.push(`user_id=$${values.length}`);
  }

  if (!conditions.length) return null;

  const { rows } = await client.query(
    `SELECT * FROM accounts WHERE ${conditions.join(" AND ")} LIMIT 1`,
    values
  );

  return map(rows[0]);
}

// IMPORTANT:
// Money transfer ke waqt account row ko lock karte hain.
// Jab tak current DB transaction complete nahi hoti,
// doosra transaction isi row ko safely lock nahi kar sakta.
async function findByIdForUpdate(id, client) {
  const { rows } = await client.query(
    "SELECT * FROM accounts WHERE id=$1 FOR UPDATE",
    [id]
  );

  return map(rows[0]);
}

// Balance accounts table mein directly store nahi hai.
// Ledger se calculate hota hai:
//
// Balance = Total CREDIT - Total DEBIT
async function getBalance(id, client = pool) {
  const { rows } = await client.query(
    `SELECT COALESCE(
       SUM(CASE WHEN type='CREDIT' THEN amount ELSE -amount END),
       0
     ) AS balance
     FROM ledger
     WHERE account_id=$1`,
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