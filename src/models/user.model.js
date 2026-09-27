const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");

// PostgreSQL row ko user object mein convert karta hai.
// Password response object mein normally nahi bhejna hai.
const mapUser = (r, password = false, system = false) => {
  if (!r) return null;

  const u = {
    _id: r.id,
    email: r.email,
    name: r.name,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };

  // Sirf login ke time password hash chahiye.
  if (password) u.password = r.password;

  // System user check ke liye ye field chahiye.
  if (system) u.systemUser = r.system_user;

  // Controller mein user.comparePassword(password) use kar sakte hain.
  u.comparePassword = (p) => bcrypt.compare(p, r.password);

  return u;
};

// Password ko plaintext mein DB mein store nahi karna.
// Pehle bcrypt hash banta hai, phir PostgreSQL mein save hota hai.
async function create({ email, password, name, systemUser = false }, client = pool) {
  const hash = await bcrypt.hash(password, 10);

  const { rows } = await client.query(
    "INSERT INTO users(email,password,name,system_user) VALUES($1,$2,$3,$4) RETURNING *",
    [email.trim().toLowerCase(), hash, name, systemUser]
  );

  return mapUser(rows[0]);
}

// Email se user find karta hai.
async function findOne({ email, selectPassword = false }, client = pool) {
  const { rows } = await client.query(
    "SELECT * FROM users WHERE email=$1 LIMIT 1",
    [email.trim().toLowerCase()]
  );

  return mapUser(rows[0], selectPassword);
}

// JWT ke userId se PostgreSQL mein user find karta hai.
async function findById(id, { selectSystemUser = false } = {}, client = pool) {
  const { rows } = await client.query(
    "SELECT * FROM users WHERE id=$1 LIMIT 1",
    [id]
  );

  return mapUser(rows[0], false, selectSystemUser);
}

module.exports = { create, findOne, findById };