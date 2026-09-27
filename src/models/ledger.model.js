const { pool } = require("../config/db");

async function create({ account, amount, transaction, type }, client = pool) {
  const id = crypto.randomUUID();

  await client.execute(
    `INSERT INTO ledger(id,account_id,amount,transaction_id,type)
     VALUES(?,?,?,?,?)`,
    [id, account, amount, transaction, type]
  );

  const [rows] = await client.execute(
    "SELECT * FROM ledger WHERE id=?",
    [id]
  );

  const r = rows[0];

  return {
    _id: r.id,
    account: r.account_id,
    amount: Number(r.amount),
    transaction: r.transaction_id,
    type: r.type,
    createdAt: r.created_at
  };
}

module.exports = { create };