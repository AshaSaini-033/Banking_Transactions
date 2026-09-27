const { pool } = require("../config/db");

// Ledger financial history ka permanent record hai.
// Ek transfer ke liye sender aur receiver ke ledger entries banti hain.
async function create({ account, amount, transaction, type }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO ledger(account_id,amount,transaction_id,type)
     VALUES($1,$2,$3,$4)
     RETURNING *`,
    [account, amount, transaction, type]
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