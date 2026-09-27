const { pool } = require("../config/db");

const map = r => r ? {
  _id:r.id,user:r.user_id,status:r.status,currency:r.currency,
  createdAt:r.created_at,updatedAt:r.updated_at
} : null;

async function create({user},client=pool) {
  const {rows}=await client.query(
    "INSERT INTO accounts(user_id) VALUES($1) RETURNING *",[user]);
  return map(rows[0]);
}

async function find({user},client=pool) {
  const {rows}=await client.query(
    "SELECT * FROM accounts WHERE user_id=$1 ORDER BY created_at DESC",[user]);
  return rows.map(map);
}

async function findOne({_id,user},client=pool) {
  const c=[],v=[];
  if(_id){v.push(_id);c.push(`id=$${v.length}`);}
  if(user){v.push(user);c.push(`user_id=$${v.length}`);}
  if(!c.length)return null;
  const {rows}=await client.query(`SELECT * FROM accounts WHERE ${c.join(" AND ")} LIMIT 1`,v);
  return map(rows[0]);
}

async function findByIdForUpdate(id,client) {
  const {rows}=await client.query("SELECT * FROM accounts WHERE id=$1 FOR UPDATE",[id]);
  return map(rows[0]);
}

async function getBalance(id,client=pool) {
  const {rows}=await client.query(
    "SELECT COALESCE(SUM(CASE WHEN type='CREDIT' THEN amount ELSE -amount END),0) AS balance FROM ledger WHERE account_id=$1",[id]);
  return Number(rows[0].balance);
}

module.exports={create,find,findOne,findByIdForUpdate,getBalance};