# 🏦 Banking Transactions API

> **Asha Saini — Backend Banking System**
>
> Concurrency-safe banking backend using **Node.js, Express.js, MySQL, Redis, Redlock and JWT**.

## 🎯 What This Project Does

This project demonstrates how a banking backend can safely process money transfers while handling concurrency, duplicate requests, authentication and financial auditability.

Core ideas:
- MySQL is the financial **source of truth**.
- Redis/Redlock provides **distributed coordination**.
- MySQL `FOR UPDATE` provides **database-level row locking**.
- Every transfer uses **double-entry ledger accounting**.
- Idempotency keys prevent **duplicate payments**.
- MySQL transactions provide **atomicity**.
- Ledger records are protected from modification/deletion.

## 🏗️ Detailed Architecture

```text
                         ┌────────────────────────┐
                         │        CLIENT          │
                         │  Postman / Frontend    │
                         └───────────┬────────────┘
                                     │ HTTP
                                     ▼
                         ┌────────────────────────┐
                         │     EXPRESS / NODE     │
                         │       REST API         │
                         └───────────┬────────────┘
                                     │
                         ┌───────────▼────────────┐
                         │    AUTH MIDDLEWARE     │
                         │ JWT + Token Blacklist  │
                         └───────────┬────────────┘
                                     │
                                     ▼
                         ┌────────────────────────┐
                         │      CONTROLLER        │
                         │ Validation + Business  │
                         │       Logic            │
                         └───────────┬────────────┘
                                     │
                   ┌─────────────────┴─────────────────┐
                   │                                   │
                   ▼                                   ▼
        ┌──────────────────────┐            ┌──────────────────────┐
        │        REDIS         │            │     MySQL       │
        │                      │            │                      │
        │ Redlock              │            │ Financial Source     │
        │ Distributed Lock     │            │       of Truth       │
        └──────────┬───────────┘            └───────────┬──────────┘
                   │                                    │
                   │                       ┌────────────┼────────────┐
                   │                       │            │            │
                   │                       ▼            ▼            ▼
                   │                    Users       Accounts   Transactions
                   │                                                 │
                   │                                                 ▼
                   │                                             Ledger
                   │                                         DEBIT/CREDIT
                   │
                   └──────────────► Lock Released
                                             │
                                             ▼
                                      Email Service
```

## 🔄 Complete Money Transfer Flow

```text
POST /api/transactions
        │
        ▼
1. Validate request
        │
        ├── account IDs valid?
        ├── amount positive?
        ├── sender != receiver?
        └── idempotency key present?
        │
        ▼
2. Check idempotency key
        │
        ├── COMPLETED → return old transaction
        ├── PENDING   → return processing
        └── new       → continue
        │
        ▼
3. Validate sender + receiver
        │
        ▼
4. Check account status
        │
        ├── ACTIVE → continue
        └── otherwise → reject
        │
        ▼
5. Acquire Redis/Redlock
        │
        ▼
6. MySQL BEGIN
        │
        ▼
7. SELECT sender FOR UPDATE
   SELECT receiver FOR UPDATE
        │
        ▼
8. Calculate balance
        │
        ├── insufficient → ROLLBACK
        └── sufficient
        │
        ▼
9. INSERT transaction = PENDING
        │
        ▼
10. INSERT sender DEBIT ledger
        │
        ▼
11. INSERT receiver CREDIT ledger
        │
        ▼
12. UPDATE transaction = COMPLETED
        │
        ▼
13. COMMIT
        │
        ▼
14. Release Redis lock
        │
        ▼
15. Send email notification
        │
        ▼
16. Return success
```

## 💸 Double-Entry Ledger

For a ₹500 transfer from A → B:

```text
Account A                         Account B
─────────                         ─────────
DEBIT  ₹500                      CREDIT ₹500
```

Balance is derived as:

```text
Balance = Total CREDIT - Total DEBIT
```

This means the system keeps the financial history instead of relying only on a mutable balance column.

## 🗄️ Database ER Diagram

```text
┌─────────────────────┐
│        USERS        │
├─────────────────────┤
│ id PK               │
│ email UNIQUE        │
│ name                │
│ password            │
│ system_user         │
└──────────┬──────────┘
           │ 1
           │
           │ N
           ▼
┌─────────────────────┐
│      ACCOUNTS       │
├─────────────────────┤
│ id PK               │
│ user_id FK          │
│ status              │
│ currency            │
└───────┬─────────────┘
        │
        ├──────────────────────┐
        │                      │
        ▼                      ▼
┌───────────────────┐   ┌──────────────────────┐
│      LEDGER       │   │     TRANSACTIONS     │
├───────────────────┤   ├──────────────────────┤
│ id PK             │   │ id PK                │
│ account_id FK     │   │ from_account FK      │
│ amount            │   │ to_account FK        │
│ transaction_id FK │   │ amount               │
│ type              │   │ status               │
└───────────────────┘   │ idempotency_key      │
                        └──────────────────────┘

┌────────────────────────┐
│    TOKEN_BLACKLIST     │
├────────────────────────┤
│ id PK                  │
│ token UNIQUE           │
│ blacklisted_at         │
└────────────────────────┘
```

## 🔐 Concurrency Control

Consider balance = ₹1000 and two concurrent requests:

```text
Request A → transfer ₹800
Request B → transfer ₹800
```

Without locking, both could read ₹1000 before either writes. That creates a race condition and possible double spending.

This project uses two layers:

### 1. Redis / Redlock

Accounts are locked using keys such as:

```text
account:<senderId>
account:<receiverId>
```

The keys are sorted before acquiring the lock so A→B and B→A use deterministic lock ordering.

### 2. MySQL FOR UPDATE

Inside the SQL transaction the account rows are locked before checking the balance.

```sql
SELECT * FROM accounts WHERE id = $1 FOR UPDATE;
```

MySQL therefore protects the final database state even when multiple requests arrive concurrently.

## 🧱 ACID Transaction

```text
BEGIN
 │
 ├── Lock sender
 ├── Lock receiver
 ├── Check balance
 ├── Create PENDING transaction
 ├── Create DEBIT
 ├── Create CREDIT
 ├── Mark COMPLETED
 │
COMMIT
```

If any operation fails:

```text
ROLLBACK
```

So we never intentionally commit a state where the sender is debited but the receiver is not credited.

## 🔁 Idempotency

Every payment contains an `idempotencyKey`.

Example:

```json
{
  "fromAccount": "A",
  "toAccount": "B",
  "amount": 500,
  "idempotencyKey": "payment-123"
}
```

First request creates transaction T1.

```text
payment-123 → T1
```

If the client retries with the same key:

```text
payment-123 already exists
        ↓
return T1
        ↓
do not transfer another ₹500
```

The MySQL schema also has a UNIQUE constraint on `idempotency_key` as a final database-level safeguard.

## 🔑 Authentication Flow

```text
REGISTER
   │
   ▼
Password → bcrypt hash → MySQL

LOGIN
   │
   ▼
Find user → bcrypt.compare() → JWT
   │
   ▼
Cookie / Bearer token

PROTECTED REQUEST
   │
   ▼
Read JWT → check blacklist → verify JWT
   │
   ▼
Find user in MySQL
   │
   ▼
req.user → Controller
```

## 📁 Project Structure

```text
Banking_Transactions/
│
├── server.js
├── schema.sql
├── package.json
├── .env.example
│
└── src/
    ├── app.js
    │
    ├── config/
    │   ├── db.js
    │   ├── redis.js
    │   └── redlock.js
    │
    ├── controllers/
    │   ├── auth.controller.js
    │   ├── account.controller.js
    │   └── transaction.controller.js
    │
    ├── models/
    │   ├── user.model.js
    │   ├── account.model.js
    │   ├── transaction.model.js
    │   ├── ledger.model.js
    │   └── blacklist.model.js
    │
    ├── middlewares/
    │   └── auth.middleware.js
    │
    ├── routes/
    │   ├── auth.routes.js
    │   ├── account.routes.js
    │   └── transition.route.js
    │
    └── services/
        └── email.service.js
```

## 🚪 API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout and blacklist token |
| POST | `/api/account/create` | Create bank account |
| GET | `/api/account/` | Get user's accounts |
| GET | `/api/account/balance/:accountId` | Get balance |
| POST | `/api/transactions/` | Transfer money |
| POST | `/api/transactions/system/initial-funds` | Add initial system funds |

## ⚙️ Installation

### 1. Clone
```bash
git clone https://github.com/AshaSaini-033/Banking_Transactions.git
cd Banking_Transactions
```

### 2. Install
```bash
pnpm install
```

### 3. Create MySQL database
```sql
CREATE DATABASE banking;
```

### 4. Run schema
```bash
mysql -u root -p banking < schema.sql
```

### 5. Start Redis
```bash
docker run -d --name redis -p 6379:6379 redis:latest
```

### 6. Configure `.env`
Use `.env.example` as the template.

### 7. Start server
```bash
pnpm run dev
```

## 🔧 Environment Variables

```env
PORT=3000
DATABASE_URL=MySQL://postgres:password@localhost:5432/banking
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_super_secret_key
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
NODE_ENV=development
```

Never commit the real `.env` file.

## 🧪 Important Testing Scenarios

### Normal transfer
```text
A = ₹1000
B = ₹500
A sends ₹300 to B
Result: A = ₹700, B = ₹800
```

### Insufficient balance
```text
A = ₹100
Transfer = ₹500
Expected: 400 Insufficient balance
```

### Duplicate payment
Send the same idempotency key twice. Only one logical transaction should be created.

### Concurrent transfer
```text
A = ₹1000
Request 1 → A → B ₹800
Request 2 → A → C ₹800
```

Expected: only one transfer can consume the available ₹1000 balance.

## 🧠 Why MySQL + Redis?

| Component | Responsibility |
|---|---|
| MySQL | Financial source of truth |
| MySQL Transaction | Atomic money movement |
| MySQL FOR UPDATE | Database row locking |
| MySQL Constraints | Data integrity |
| MySQL Trigger | Immutable ledger |
| Redis | Distributed coordination |
| Redlock | Account-level distributed lock |
| JWT | Authentication |
| bcrypt | Password hashing |

Redis does **not** store the financial balance. If Redis is unavailable, the application should not bypass the lock and process money unsafely.

## 🎤 1-Minute Interview Explanation

> I built a concurrency-safe banking backend using Node.js, Express and MySQL. Users can create accounts and transfer money. Instead of directly updating a balance, I use a double-entry ledger where every transfer creates a debit for the sender and a credit for the receiver. MySQL transactions make the complete operation atomic, while `SELECT FOR UPDATE` prevents concurrent requests from reading the same account balance at the same time. Redis with Redlock adds distributed account-level coordination. I also implemented idempotency keys to prevent duplicate payments, JWT and bcrypt for authentication, and MySQL triggers to protect immutable ledger records. MySQL remains the final source of truth.

## 🚀 Future Improvements

- Outbox pattern for reliable email delivery
- Transaction reconciliation
- Rate limiting
- Prometheus metrics and monitoring
- OpenTelemetry tracing
- Automated concurrency/load tests
- Integration tests
- Swagger/OpenAPI
- Refresh-token rotation
- Transaction history APIs
- Database migration tooling

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| Node.js | Runtime |
| Express.js | REST API |
| MySQL | Financial database |
| pg | MySQL driver |
| Redis | Distributed coordination |
| Redlock | Distributed locking |
| JWT | Authentication |
| bcryptjs | Password hashing |
| Nodemailer | Email notification |
| Docker | Local Redis infrastructure |
| pnpm | Package manager |

## 👩‍💻 Author

**Asha Saini**

B.Tech Information Technology — NIT Srinagar

GitHub: https://github.com/AshaSaini-033