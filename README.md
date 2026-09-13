# 🏦 Banking Transactions API

A reliable and concurrency-safe **banking transaction backend API** built with **Node.js, Express.js, MongoDB, Redis, and Mongoose**.

The project demonstrates how a financial transaction system can handle **atomic database operations, double-entry accounting, distributed locking, concurrent requests, idempotency, authentication, and immutable financial records**.

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Architecture](#-architecture)
- [Core Design Concepts](#-core-design-concepts)
  - [Double-Entry Ledger](#1-double-entry-ledger)
  - [ACID Transactions](#2-acid-transactions)
  - [Redis Distributed Locking](#3-redis-distributed-locking)
  - [Deterministic Lock Ordering](#4-deterministic-lock-ordering)
  - [Idempotency](#5-idempotency)
  - [Immutable Ledger](#6-immutable-ledger)
- [Transaction Flow](#-transaction-flow)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Environment Variables](#-environment-variables)
- [Running Redis Locally](#-running-redis-locally)
- [Running the Application](#-running-the-application)
- [Concurrency Testing](#-concurrency-testing)
- [Idempotency Testing](#-idempotency-testing)
- [Production Deployment](#-production-deployment)
- [Design Considerations](#-design-considerations)
- [Future Improvements](#-future-improvements)
- [Learning Outcomes](#-learning-outcomes)
- [Author](#-author)

---

# 📖 Overview

This project implements a backend banking transaction system where users can transfer money between accounts.

The main goal is not only to perform transfers but also to demonstrate how to maintain **financial consistency and correctness under concurrent requests**.

The system uses:

- **MongoDB** as the financial source of truth
- **MongoDB transactions** for atomic database operations
- **Redis** for distributed concurrency control
- **Redlock** for distributed account-level locks
- **Idempotency keys** to prevent duplicate transactions
- **Double-entry ledger accounting** for auditable financial records
- **JWT authentication** for securing API access

---

# 🚀 Features

- 🔐 JWT-based authentication
- 👤 User and account management
- 💸 Account-to-account fund transfers
- 📒 Ledger-based balance calculation
- ⚛️ MongoDB ACID transactions
- 🔄 Double-entry accounting
- 🔒 Redis distributed locking
- 🧵 Concurrent transaction protection
- 🔁 Idempotent transaction requests
- 🛡️ Immutable ledger entries
- 📧 Transaction email notifications
- 🐳 Docker-based Redis setup
- ☁️ Redis Cloud support
- 🚀 Render deployment support

---

# 🏗️ Architecture

```text
                         ┌──────────────┐
                         │    Client    │
                         └──────┬───────┘
                                │
                                ▼
                     ┌────────────────────┐
                     │   Express.js API   │
                     └─────────┬──────────┘
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
                 ▼                           ▼
        ┌─────────────────┐        ┌─────────────────┐
        │ JWT             │        │ Request        │
        │ Authentication  │        │ Validation     │
        └────────┬────────┘        └────────┬────────┘
                 │                           │
                 └─────────────┬─────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Idempotency Check   │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Redis Distributed    │
                    │ Lock 🔒              │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ MongoDB Transaction │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       ┌────────────┐   ┌─────────────┐   ┌─────────────┐
       │  Balance   │   │ Transaction │   │   Ledger    │
       │   Check    │   │   PENDING   │   │ DEBIT/CREDIT│
       └────────────┘   └─────────────┘   └─────────────┘
              │                │                │
              └────────────────┼────────────────┘
                               │
                               ▼
                     ┌───────────────────┐
                     │ Transaction       │
                     │ COMPLETED         │
                     └─────────┬─────────┘
                               │
                               ▼
                     ┌───────────────────┐
                     │ MongoDB COMMIT    │
                     └─────────┬─────────┘
                               │
                               ▼
                     ┌───────────────────┐
                     │ Release Redis 🔓  │
                     └─────────┬─────────┘
                               │
                               ▼
                     ┌───────────────────┐
                     │ Email Notification│
                     └───────────────────┘

                     🧠 Core Design Concepts
1. Double-Entry Ledger

The system does not treat the account balance as a directly mutable financial value.

Instead, the balance is derived from ledger entries.

Balance = Total Credits - Total Debits

For example, if Account A transfers ₹500 to Account B:

Account A
──────────────
DEBIT  ₹500


Account B
──────────────
CREDIT ₹500

Both entries belong to the same transaction.

This provides an auditable history of financial activity.

2. ACID Transactions

MongoDB sessions are used to make the complete transfer operation atomic.

The transaction flow is:

Create PENDING transaction
          │
          ▼
Create DEBIT ledger entry
          │
          ▼
Create CREDIT ledger entry
          │
          ▼
Mark transaction COMPLETED
          │
          ▼
Commit MongoDB transaction

If any operation fails:

          │
          ▼
       ROLLBACK
          │
          ▼
No partial transaction

This prevents situations such as:

❌ Sender debited
❌ Receiver not credited

Instead, the database transaction ensures that the related operations succeed or fail together.

3. Redis Distributed Locking

Concurrent transfers from the same account can create race conditions.

Consider:

Initial Balance = ₹1000

Two requests arrive at approximately the same time:

Request A → Transfer ₹800
Request B → Transfer ₹800

Without concurrency control:

Request A → reads ₹1000
Request B → reads ₹1000

Both requests believe the balance is sufficient.

This could result in double-spending.

Solution

Redis is used as a distributed coordination layer.

Locks are created for the accounts participating in the transaction:

account:<senderId>
account:<receiverId>

Example:

Request A

A → B
 │
 ├── 🔒 account:A
 └── 🔒 account:B


Request B

A → C
 │
 └── ❌ account:A already locked

Therefore, conflicting transactions cannot execute their critical sections simultaneously.

MongoDB remains the source of truth. Redis is only used for concurrency coordination.

4. Deterministic Lock Ordering

When multiple accounts need to be locked, the account keys are sorted before acquiring the lock.

const accountKeys = [
    `account:${fromAccount}`,
    `account:${toAccount}`
].sort();

This ensures that transfers such as:

A → B

and

B → A

follow the same lock acquisition order.

This reduces the possibility of inconsistent lock ordering and deadlock-style contention.

5. Idempotency

Every transaction requires an idempotency key.

Example request:

{
  "fromAccount": "ACCOUNT_A",
  "toAccount": "ACCOUNT_B",
  "amount": 500,
  "idempotencyKey": "payment-123"
}

If the client retries the same request:

idempotencyKey = payment-123

the system can recognize that the request represents the same logical payment.

Instead of creating another transaction, the existing transaction can be identified.

The database also enforces uniqueness on the idempotencyKey as a final layer of protection against duplicate transaction creation.

6. Immutable Ledger

Ledger entries are intended to be immutable.

Once an entry is created:

DEBIT ₹500

it should not be modified or deleted.

If a transaction needs correction, the system should create a new transaction or reversal instead of changing historical ledger data.

This helps preserve:

Auditability
Financial history
Transaction integrity
Traceability
🔄 Transaction Flow

A normal transfer follows these steps:

1. Validate request
        ↓
2. Validate idempotency key
        ↓
3. Validate accounts
        ↓
4. Validate account status
        ↓
5. Acquire Redis lock
        ↓
6. Start MongoDB session
        ↓
7. Read sender balance
        ↓
8. Check sufficient balance
        ↓
9. Create PENDING transaction
        ↓
10. Create DEBIT ledger entry
        ↓
11. Create CREDIT ledger entry
        ↓
12. Mark transaction COMPLETED
        ↓
13. Commit MongoDB transaction
        ↓
14. End MongoDB session
        ↓
15. Release Redis lock
        ↓
16. Send email notification
🛠️ Tech Stack
Backend
Technology	Purpose
Node.js	JavaScript runtime
Express.js	REST API framework
JavaScript	Application development
Database
Technology	Purpose
MongoDB	Primary database
Mongoose	MongoDB ODM
Distributed Coordination
Technology	Purpose
Redis	Distributed locking
ioredis	Redis client
Redlock	Distributed lock implementation
Authentication
Technology	Purpose
JWT	Authentication
HTTP Cookies	Token transport
Infrastructure
Technology	Purpose
Docker	Local Redis environment
Redis Cloud	Managed Redis
Render	Application deployment
📁 Project Structure
banking-transactions/
│
├── src/
│   │
│   ├── config/
│   │   ├── db.js
│   │   ├── redis.js
│   │   └── redlock.js
│   │
│   ├── controllers/
│   │   ├── account.controller.js
│   │   ├── auth.controller.js
│   │   └── transaction.controller.js
│   │
│   ├── middleware/
│   │   └── auth.middleware.js
│   │
│   ├── models/
│   │   ├── account.model.js
│   │   ├── ledger.model.js
│   │   └── transaction.model.js
│   │
│   ├── routes/
│   │   ├── account.route.js
│   │   ├── auth.route.js
│   │   └── transaction.route.js
│   │
│   ├── services/
│   │   └── email.service.js
│   │
│   └── app.js
│
├── .env
├── package.json
├── pnpm-lock.yaml
└── README.md
📋 Prerequisites

Before running the project, make sure you have:

Node.js installed
pnpm installed
MongoDB database
Redis
Docker (optional if Redis is running locally through Docker)
⚙️ Installation
1. Clone the Repository
git clone https://github.com/hitesh12321/banking-transactions.git

Navigate into the project:

cd banking-transactions
2. Install Dependencies

Using pnpm:

pnpm install
🐳 Running Redis Locally

The application uses Redis for distributed locking.

You can start Redis using Docker:

docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:latest

Check whether the container is running:

docker ps
Test Redis

Open the Redis CLI:

docker exec -it redis redis-cli

Run:

PING

Expected response:

PONG
🔐 Environment Variables

Create a .env file in the root directory:

PORT=3000

MONGO_URI=your_mongodb_connection_string

REDIS_URL=redis://localhost:6379

JWT_SECRET=your_jwt_secret

# Other application-specific environment variables
Example Local Configuration
PORT=3000
MONGO_URI=mongodb://localhost:27017/banking
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_super_secret_key

Never commit your .env file to GitHub.

Add it to .gitignore:

.env
node_modules/
▶️ Running the Application
Development
pnpm run dev

The API will start on the configured port.

For example:

http://localhost:3000
Production
pnpm start
🔒 Redis Lock Example

The transaction controller uses account-scoped locks.

const accountKeys = [
    `account:${fromAccount}`,
    `account:${toAccount}`
].sort();

const lock = await redLock.acquire(
    accountKeys,
    10000
);

try {
    // MongoDB transaction
} finally {
    if (lock) {
        try {
            await lock.release();
        } catch (error) {
            console.error(
                "Failed to release Redis lock:",
                error.message
            );
        }
    }
}

The lock has a TTL so that a crashed application does not hold the lock indefinitely.

🧪 Concurrency Testing

A key test scenario is sending two transfers concurrently from the same account.

Initial balance:

₹1000

Two requests:

Request A:
A → B ₹800


Request B:
A → C ₹800

Because both transactions require a lock on Account A, they cannot enter the conflicting critical section simultaneously.

Expected Result

Only one ₹800 transfer can successfully consume the available balance.

Remaining balance:

₹200

This demonstrates application-level concurrency control.

🔁 Idempotency Testing

Send a transaction:

{
  "fromAccount": "A",
  "toAccount": "B",
  "amount": 100,
  "idempotencyKey": "payment-001"
}

Repeat the request using the same:

idempotencyKey = payment-001

The system recognizes the existing transaction instead of treating it as a new logical payment.

🧩 Why Redis + MongoDB?

Redis and MongoDB solve different problems.

┌──────────────────────┬──────────────────────────────┐
│ Component            │ Responsibility               │
├──────────────────────┼──────────────────────────────┤
│ Redis                │ Distributed concurrency      │
│ MongoDB Transaction  │ Atomic database operations   │
│ Idempotency Key      │ Duplicate request protection │
│ Immutable Ledger     │ Financial auditability      │
│ MongoDB              │ Source of truth              │
└──────────────────────┴──────────────────────────────┘

Redis is not used as the financial source of truth.

MongoDB contains the persistent financial state.

🚀 Production Deployment

The backend can be deployed using a platform such as Render.

A production architecture can look like:

                         Internet
                            │
                            ▼
                    ┌───────────────┐
                    │    Render     │
                    │  Node.js API  │
                    └───────┬───────┘
                            │
                 ┌──────────┴──────────┐
                 │                     │
                 ▼                     ▼
          ┌──────────────┐      ┌──────────────┐
          │ MongoDB Atlas│      │ Redis Cloud  │
          └──────┬───────┘      └──────┬───────┘
                 │                     │
                 ▼                     ▼
          Financial Data        Distributed Locks
Local Redis
REDIS_URL=redis://localhost:6379
Production Redis
REDIS_URL=<managed-redis-connection-string>

The application code can remain unchanged between local and production environments by configuring the environment variable appropriately.

⚠️ Design Considerations
Redis is a Coordination Layer

The application does not depend on Redis for permanent financial state.

If Redis is unavailable, the transaction should not bypass the lock and continue unsafely.

Lock TTL

Redis locks have a finite TTL.

The TTL should be comfortably longer than the expected duration of the critical section.

For long-running critical sections, lock extension or renewal may be required.

Email Notifications

Email notifications are sent after the database transaction commits.

This prevents an external email service from unnecessarily extending or interfering with the MongoDB transaction.

🔮 Future Improvements
 Redis lock renewal using lock.extend()
 Transaction retry strategy
 Outbox pattern for reliable email delivery
 Rate limiting
 Transaction reconciliation
 Structured logging
 Metrics and observability
 Automated concurrency/load testing
 Comprehensive unit tests
 Comprehensive integration tests
 Swagger/OpenAPI documentation
 Better error handling
 Transaction monitoring
 Audit trail improvements
🎯 Learning Outcomes

This project demonstrates practical understanding of:

REST API development
Node.js backend development
Express.js
MongoDB transactions
ACID properties
Double-entry accounting
Ledger-based financial systems
Redis
Distributed locking
Concurrency
Race conditions
Idempotency
JWT authentication
Authorization
Database consistency
Failure handling
Docker
Production environment configuration
💡 Project Highlights

MongoDB provides atomicity. Redis provides distributed coordination. Idempotency prevents duplicate operations. The immutable ledger provides an auditable financial history.

The project demonstrates how these concepts can work together to build a more reliable transaction-processing system.

👨‍💻 Author

Asha Saini

GitHub:

https://github.com/AshaSaini-033

⭐ Support

If you found this project useful or interesting, consider giving the repository a ⭐ on GitHub.
