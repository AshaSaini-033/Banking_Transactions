const crypto = require("crypto");
const { pool } = require("../config/db");

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

async function findOne({ idempotencyKey }, client = pool) {
  const [rows] = await client.execute(
    "SELECT * FROM transactions WHERE idempotency_key=? LIMIT 1",
    [idempotencyKey]
  );

  return map(rows[0]);
}

async function create(
  { fromAccount, toAccount, amount, idempotencyKey, status = "PENDING" },
  client = pool
) {
  const id = crypto.randomUUID();

  await client.execute(
    `INSERT INTO transactions
      (id,from_account,to_account,amount,idempotency_key,status)
     VALUES(?,?,?,?,?,?)`,
    [id, fromAccount, toAccount, amount, idempotencyKey, status]
  );

  const [rows] = await client.execute(
    "SELECT * FROM transactions WHERE id=?",
    [id]
  );

  return map(rows[0]);
}

async function updateStatus(id, status, client = pool) {
  await client.execute(
    "UPDATE transactions SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    [status, id]
  );

  const [rows] = await client.execute(
    "SELECT * FROM transactions WHERE id=?",
    [id]
  );

  return map(rows[0]);
}

module.exports = { findOne, create, updateStatus };