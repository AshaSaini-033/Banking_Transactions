# 🏦 Banking Transactions API

Concurrency-safe banking backend built with **Node.js, Express, PostgreSQL, Redis and JWT**.

## Features
- JWT authentication and bcrypt password hashing
- User and account management
- Account-to-account transfers
- Double-entry ledger
- PostgreSQL ACID transactions
- PostgreSQL `SELECT ... FOR UPDATE` row locking
- Redis/Redlock distributed account locks
- Idempotency keys
- Immutable ledger enforced by PostgreSQL trigger
- Email notifications

## Architecture

```text
Client
  ↓
Express API
  ↓
JWT Authentication
  ↓
Idempotency Check
  ↓
Redis/Redlock account lock
  ↓
PostgreSQL BEGIN
  ↓
SELECT accounts FOR UPDATE
  ↓
Balance = Credits - Debits
  ↓
PENDING transaction
  ↓
DEBIT + CREDIT ledger entries
  ↓
COMPLETED transaction
  ↓
COMMIT
  ↓
Release Redis lock
  ↓
Email notification
```

## PostgreSQL data model

```text
users
  │
  └──< accounts
          │
          ├──< ledger
          │
          └──< transactions >── accounts
```

Run the schema once:

```bash
psql -U postgres -d banking -f schema.sql
```

## Installation

```bash
git clone https://github.com/AshaSaini-033/Banking_Transactions.git
cd Banking_Transactions
pnpm install
```

Create `.env` from `.env.example`.

Example:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/banking
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_super_secret_key
```

## Run

```bash
pnpm run dev
```

or

```bash
pnpm start
```

## API

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`

### Accounts
- `POST /api/account/create`
- `GET /api/account/`
- `GET /api/account/balance/:accountId`

### Transactions
- `POST /api/transactions/`
- `POST /api/transactions/system/initial-funds`

Transfer example:

```json
{
  "fromAccount": "sender-uuid",
  "toAccount": "receiver-uuid",
  "amount": 500,
  "idempotencyKey": "payment-001"
}
```

## Concurrency design

Redis prevents conflicting application-level operations from entering the critical section simultaneously.

PostgreSQL is still the **source of truth**. Inside the SQL transaction, sender and receiver rows are locked with `FOR UPDATE`. This prevents concurrent requests from both consuming the same balance.

## Idempotency

`idempotency_key` is unique in PostgreSQL. A retry with the same key returns the existing transaction instead of creating a duplicate payment.

## Ledger

Balances are derived rather than stored as a mutable field:

```text
Balance = Total CREDIT - Total DEBIT
```

Ledger records are protected by a PostgreSQL trigger and cannot be updated or deleted.

## Tech Stack

- Node.js
- Express.js
- PostgreSQL
- pg
- Redis
- ioredis
- Redlock
- JWT
- bcryptjs
- Nodemailer

## Author

**Asha Saini**

GitHub: https://github.com/AshaSaini-033