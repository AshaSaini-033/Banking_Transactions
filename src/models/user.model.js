const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");

// MySQL row ko application user object mein convert karte hain.
const mapUser = (r, password = false, system = false) => {
  if (!r) return null;

  const u = {
    _id: r.id,
    email: r.email,
    name: r.name,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };

  // Password hash sirf login ke waqt internally chahiye.
  if (password) u.password = r.password;

  if (system) u.systemUser = Boolean(r.system_user);

  u.comparePassword = (p) => bcrypt.compare(p, r.password);

  return u;
};

// Password ko plaintext mein store nahi karna.
// bcrypt hash banakar MySQL mein save karte hain.
async function create({ email, password, name, systemUser = false }, client = pool) {
  const hash = await bcrypt.hash(password, 10);
  const id = crypto.randomUUID();

  await client.execute(
    "INSERT INTO users(id,email,password,name,system_user) VALUES(?,?,?,?,?)",
    [id, email.trim().toLowerCase(), hash, name, systemUser]
  );

  const [rows] = await client.execute(
    "SELECT * FROM users WHERE id=?",
    [id]
  );

  return mapUser(rows[0]);
}

async function findOne({ email, selectPassword = false }, client = pool) {
  const [rows] = await client.execute(
    "SELECT * FROM users WHERE email=? LIMIT 1",
    [email.trim().toLowerCase()]
  );

  return mapUser(rows[0], selectPassword);
}

async function findById(id, { selectSystemUser = false } = {}, client = pool) {
  const [rows] = await client.execute(
    "SELECT * FROM users WHERE id=? LIMIT 1",
    [id]
  );

  return mapUser(rows[0], false, selectSystemUser);
}

module.exports = { create, findOne, findById };