const { pool } = require("../config/db");

// DB transaction row ko JavaScript object mein map karte hain.
const map = r => r ? {
  _id: r.id,
  fromAccount: r.from_account,
  toAccount: r.to_account,
  status: r.status,
  amount: Number(r.amount),
  idempotencyKey: r.idempotency_key,
  createdAt: r.created_at,
  updatedAt: r.updated_at
} : null;

// Same idempotency key ka payment pehle process hua hai ya nahi check.
async function findOne({ idempotencyKey }, client = pool) {
  const { rows } = await client.query(
    "SELECT * FROM transactions WHERE idempotency_key=$1 LIMIT 1",
    [idempotencyKey]
  );

  return map(rows[0]);
}

// New transaction initially PENDING state mein create hoti hai.
async function create(
  { fromAccount, toAccount, amount, idempotencyKey, status = "PENDING" },
  client = pool
) {
  const { rows } = await client.query(
    `INSERT INTO transactions
      (from_account, to_account, amount, idempotency_key, status)
     VALUES($1,$2,$3,$4,$5)
     RETURNING *`,
    [fromAccount, toAccount, amount, idempotencyKey, status]
  );

  return map(rows[0]);
}

// Ledger successfully create hone ke baad transaction ko COMPLETED karte hain.
async function updateStatus(id, status, client = pool) {
  const { rows } = await client.query(
    "UPDATE transactions SET status=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *",
    [status, id]
  );

  return map(rows[0]);
}

module.exports = { findOne, create, updateStatus };