const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");

const mapUser = (r, password = false, system = false) => {
  if (!r) return null;
  const u = { _id:r.id, email:r.email, name:r.name, createdAt:r.created_at, updatedAt:r.updated_at };
  if (password) u.password = r.password;
  if (system) u.systemUser = r.system_user;
  u.comparePassword = (p) => bcrypt.compare(p, r.password);
  return u;
};

async function create({email,password,name,systemUser=false}, client=pool) {
  const hash = await bcrypt.hash(password, 10);
  const {rows} = await client.query(
    "INSERT INTO users(email,password,name,system_user) VALUES($1,$2,$3,$4) RETURNING *",
    [email.trim().toLowerCase(),hash,name,systemUser]
  );
  return mapUser(rows[0]);
}

async function findOne({email,selectPassword=false}, client=pool) {
  const {rows} = await client.query("SELECT * FROM users WHERE email=$1 LIMIT 1",[email.trim().toLowerCase()]);
  return mapUser(rows[0],selectPassword);
}

async function findById(id,{selectSystemUser=false}={},client=pool) {
  const {rows} = await client.query("SELECT * FROM users WHERE id=$1 LIMIT 1",[id]);
  return mapUser(rows[0],false,selectSystemUser);
}

module.exports = {create,findOne,findById};