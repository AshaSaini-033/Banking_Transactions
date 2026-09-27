-- BANKING TRANSACTIONS - POSTGRESQL SCHEMA
-- Run once: psql -U postgres -d banking -f schema.sql

-- UUID generate karne ke liye PostgreSQL extension.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- USERS: application users.
-- Password yahan plaintext nahi, bcrypt hash ke form mein store hota hai.
CREATE TABLE IF NOT EXISTS users(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 email VARCHAR(255) NOT NULL UNIQUE,
 name VARCHAR(120) NOT NULL,
 password TEXT NOT NULL,
 system_user BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ACCOUNTS: ek user ke multiple accounts ho sakte hain.
CREATE TABLE IF NOT EXISTS accounts(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
   CHECK(status IN('ACTIVE','FROZEN','CLOSED')),
 currency VARCHAR(10) NOT NULL DEFAULT 'INR',
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_status
ON accounts(user_id,status);

-- TRANSACTIONS: logical money transfer.
-- from_account = sender, to_account = receiver.
-- idempotency_key UNIQUE duplicate payment ko prevent karta hai.
CREATE TABLE IF NOT EXISTS transactions(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 from_account UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
 to_account UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
 status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
   CHECK(status IN('PENDING','COMPLETED','FAILED','REVERSED')),
 amount NUMERIC(18,2) NOT NULL CHECK(amount>0),
 idempotency_key VARCHAR(255) NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT different_accounts CHECK(from_account<>to_account)
);

CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_account);
CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_account);

-- LEDGER: actual financial audit trail.
-- A -> B ₹500:
-- A = DEBIT ₹500
-- B = CREDIT ₹500
-- Balance = total CREDIT - total DEBIT
CREATE TABLE IF NOT EXISTS ledger(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
 amount NUMERIC(18,2) NOT NULL CHECK(amount>0),
 transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
 type VARCHAR(10) NOT NULL CHECK(type IN('CREDIT','DEBIT')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transaction ON ledger(transaction_id);

-- TOKEN BLACKLIST: logout ke baad JWT yahan store hota hai.
CREATE TABLE IF NOT EXISTS token_blacklist(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 token TEXT NOT NULL UNIQUE,
 blacklisted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ledger financial history hai, isliye UPDATE/DELETE allowed nahi.
-- Correction ke liye future mein reversal transaction create karna better hai.
CREATE OR REPLACE FUNCTION prevent_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ledger entries are immutable and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_no_update ON ledger;

CREATE TRIGGER ledger_no_update
BEFORE UPDATE OR DELETE ON ledger
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_modification();