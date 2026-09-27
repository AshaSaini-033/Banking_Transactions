-- ============================================================
-- BANKING TRANSACTIONS - MYSQL SCHEMA
-- ============================================================
-- Create database first:
-- CREATE DATABASE banking;
-- USE banking;
--
-- Then run this file.
-- MySQL UUIDs application side par crypto.randomUUID() se generate
-- hote hain aur CHAR(36) mein store hote hain.

CREATE DATABASE IF NOT EXISTS banking;
USE banking;

-- USERS
-- Password plaintext mein nahi, bcrypt hash ke form mein store hota hai.
CREATE TABLE IF NOT EXISTS users(
 id CHAR(36) PRIMARY KEY,
 email VARCHAR(255) NOT NULL UNIQUE,
 name VARCHAR(120) NOT NULL,
 password TEXT NOT NULL,
 system_user BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ACCOUNTS
-- Ek user ke multiple accounts ho sakte hain.
CREATE TABLE IF NOT EXISTS accounts(
 id CHAR(36) PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
 currency VARCHAR(10) NOT NULL DEFAULT 'INR',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_accounts_user
   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT chk_account_status
   CHECK (status IN ('ACTIVE','FROZEN','CLOSED')
 )
) ENGINE=InnoDB;

CREATE INDEX idx_accounts_user_status
ON accounts(user_id,status);

-- TRANSACTIONS
-- from_account = sender
-- to_account   = receiver
-- idempotency_key duplicate payment ko prevent karta hai.
CREATE TABLE IF NOT EXISTS transactions(
 id CHAR(36) PRIMARY KEY,
 from_account CHAR(36) NOT NULL,
 to_account CHAR(36) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
 amount DECIMAL(18,2) NOT NULL,
 idempotency_key VARCHAR(255) NOT NULL UNIQUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

 CONSTRAINT fk_tx_sender
   FOREIGN KEY (from_account) REFERENCES accounts(id) ON DELETE RESTRICT,
 CONSTRAINT fk_tx_receiver
   FOREIGN KEY (to_account) REFERENCES accounts(id) ON DELETE RESTRICT,
 CONSTRAINT chk_tx_status
   CHECK (status IN ('PENDING','COMPLETED','FAILED','REVERSED')),
 CONSTRAINT chk_tx_amount
   CHECK (amount > 0),
 CONSTRAINT chk_different_accounts
   CHECK (from_account <> to_account)
) ENGINE=InnoDB;

CREATE INDEX idx_transactions_from ON transactions(from_account);
CREATE INDEX idx_transactions_to ON transactions(to_account);

-- LEDGER
-- Har transfer ke liye:
-- Sender   -> DEBIT
-- Receiver -> CREDIT
--
-- Balance = Total CREDIT - Total DEBIT
CREATE TABLE IF NOT EXISTS ledger(
 id CHAR(36) PRIMARY KEY,
 account_id CHAR(36) NOT NULL,
 amount DECIMAL(18,2) NOT NULL,
 transaction_id CHAR(36) NOT NULL,
 type VARCHAR(10) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

 CONSTRAINT fk_ledger_account
   FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
 CONSTRAINT fk_ledger_transaction
   FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT,
 CONSTRAINT chk_ledger_type
   CHECK (type IN ('CREDIT','DEBIT')),
 CONSTRAINT chk_ledger_amount
   CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE INDEX idx_ledger_account ON ledger(account_id);
CREATE INDEX idx_ledger_transaction ON ledger(transaction_id);

-- TOKEN BLACKLIST
-- Logout ke baad JWT yahan store hota hai.
CREATE TABLE IF NOT EXISTS token_blacklist(
 id CHAR(36) PRIMARY KEY,
 token TEXT NOT NULL,
 blacklisted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_blacklist_token (token(255))
) ENGINE=InnoDB;

-- LEDGER IMMUTABILITY
-- Financial history ko UPDATE/DELETE nahi karna chahiye.
-- Correction ke liye reversal transaction create karna better hai.

DELIMITER $$

DROP TRIGGER IF EXISTS ledger_no_update$$
CREATE TRIGGER ledger_no_update
BEFORE UPDATE ON ledger
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Ledger entries are immutable and cannot be updated';
END$$

DROP TRIGGER IF EXISTS ledger_no_delete$$
CREATE TRIGGER ledger_no_delete
BEFORE DELETE ON ledger
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Ledger entries are immutable and cannot be deleted';
END$$

DELIMITER ;