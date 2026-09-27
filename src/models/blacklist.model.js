const { pool } = require("../config/db");

async function findOne({token},client=pool) {
  const {rows}=await client.query("SELECT * FROM token_blacklist WHERE token=$1 LIMIT 1",[token]);
  return rows[0] || null;
}
async function create({token},client=pool) {
  const {rows}=await client.query(
    "INSERT INTO token_blacklist(token) VALUES($1) ON CONFLICT(token) DO NOTHING RETURNING *",[token]);
  return rows[0] || findOne({token},client);
}
const tokenBlackListModel={findOne,create};
module.exports={tokenBlackListModel};