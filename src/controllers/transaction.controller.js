const transactionModel = require("../models/transaction.model");
const ledgerModel = require("../models/ledger.model");
const emailService = require("../services/email.service");
const accountModel = require("../models/account.model");
const { pool } = require("../config/db");
const redLock = require("../config/redlock");

// MySQL mein account IDs UUID hain.
// Isliye MongoDB ObjectId validation ki jagah UUID validation kar rahe hain.
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validId = x => typeof x === "string" && UUID.test(x);

// Agar idempotency key already mil gayi,
// to same transaction ko dobara process nahi karna.
function existing(res, t) {
  if (t.status === "COMPLETED") {
    return res.status(200).json({
      message: "Payment Successful",
      transaction: t
    });
  }

  if (t.status === "PENDING") {
    return res.status(200).json({
      message: "Payment Pending/Processing"
    });
  }

  if (t.status === "FAILED") {
    return res.status(400).json({
      message: "Payment Failed"
    });
  }

  return res.status(400).json({
    message: "Payment is Reversed, please retry"
  });
}

// ============================================================
// MAIN MONEY TRANSFER
// ============================================================

async function createTransaction(req, res) {
  const {
    fromAccount,
    toAccount,
    amount,
    idempotencyKey
  } = req.body;

  // ---------------- STEP 1: BASIC VALIDATION ----------------
  // Request mein required fields aaye hain ya nahi.
  if (
    !fromAccount ||
    !toAccount ||
    amount === undefined ||
    !idempotencyKey
  ) {
    return res.status(400).json({
      message:
        "please provide all details. fromAccount, toAccount, amount, idempotencyKey"
    });
  }

  // MongoDB ObjectId ki jagah MySQL UUID use ho raha hai.
  if (!validId(fromAccount) || !validId(toAccount)) {
    return res.status(400).json({
      message: "Invalid account ID"
    });
  }

  // Amount positive finite number hona chahiye.
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return res.status(400).json({
      message: "Amount must be a positive number"
    });
  }

  // User khud ko payment nahi kar sakta.
  if (fromAccount === toAccount) {
    return res.status(400).json({
      message: "Sender and receiver accounts must be different"
    });
  }

  // ---------------- STEP 2: IDEMPOTENCY ----------------
  // Same request retry hone par duplicate payment nahi banana.
  const old = await transactionModel.findOne({ idempotencyKey });

  if (old) {
    return existing(res, old);
  }

  // ---------------- STEP 3: ACCOUNT VALIDATION ----------------
  const sender = await accountModel.findOne({
    _id: fromAccount
  });

  const receiver = await accountModel.findOne({
    _id: toAccount
  });

  if (!sender) {
    return res.status(400).json({
      message: "provide a valid sender account"
    });
  }

  if (!receiver) {
    return res.status(400).json({
      message: "provide a valid receiver account"
    });
  }

  // Frozen/closed account se money transfer nahi hona chahiye.
  if (
    sender.status !== "ACTIVE" ||
    receiver.status !== "ACTIVE"
  ) {
    return res.status(403).json({
      message:
        "sender account and receiver account both should be Active"
    });
  }

  // ============================================================
  // STEP 4: REDIS DISTRIBUTED LOCK
  // ============================================================

  // Sender aur receiver dono ko lock karna hai.
  // Keys sort karne se A->B aur B->A ka lock order same rahega.
  // Isse inconsistent lock ordering ka risk kam hota hai.
  const keys = [
    `account:${fromAccount}`,
    `account:${toAccount}`
  ].sort();

  let lock;
  let client;

  try {
    // Redis/Redlock application-level distributed coordination deta hai.
    // Important: Redis money store nahi karta.
    lock = await redLock.acquire(keys, 10000);

    // MySQL pool se dedicated connection le rahe hain.
    // Transaction ke saare SQL queries isi client par chalni chahiye.
    client = await pool.getConnection();

    // ========================================================
    // STEP 5: mysql ACID TRANSACTION START
    // ========================================================
    await client.beginTransaction();

    // ========================================================
    // STEP 6: DATABASE ROW LOCK
    // ========================================================

    // FOR UPDATE ka matlab:
    // "In account rows ko current SQL transaction ke complete hone tak lock rakho."
    //
    // Agar doosri request same account ko lock karne ki koshish karegi,
    // MySQL usse wait karayega.
    const s = await accountModel.findByIdForUpdate(
      fromAccount,
      client
    );

    const r = await accountModel.findByIdForUpdate(
      toAccount,
      client
    );

    if (!s || !r) {
      throw Error("ACCOUNT_NOT_FOUND");
    }

    if (
      s.status !== "ACTIVE" ||
      r.status !== "ACTIVE"
    ) {
      throw Error("ACCOUNT_NOT_ACTIVE");
    }

    // ========================================================
    // STEP 7: BALANCE CHECK
    // ========================================================

    // Balance directly accounts table mein store nahi hai.
    // Ledger se calculate hota hai:
    //
    // Balance = Total CREDIT - Total DEBIT
    const balance = await accountModel.getBalance(
      fromAccount,
      client
    );

    if (balance < amount) {
      throw Error("INSUFFICIENT_BALANCE");
    }

    // ========================================================
    // STEP 8: CREATE PENDING TRANSACTION
    // ========================================================

    // Pehle transaction PENDING create karte hain.
    // Abhi money movement ke ledger records create hone baaki hain.
    const t = await transactionModel.create(
      {
        fromAccount,
        toAccount,
        amount,
        idempotencyKey,
        status: "PENDING"
      },
      client
    );

    // ========================================================
    // STEP 9: DEBIT SENDER
    // ========================================================

    // Sender ke ledger mein DEBIT entry.
    await ledgerModel.create(
      {
        account: fromAccount,
        amount,
        transaction: t._id,
        type: "DEBIT"
      },
      client
    );

    // ========================================================
    // STEP 10: CREDIT RECEIVER
    // ========================================================

    // Receiver ke ledger mein CREDIT entry.
    await ledgerModel.create(
      {
        account: toAccount,
        amount,
        transaction: t._id,
        type: "CREDIT"
      },
      client
    );

    // ========================================================
    // STEP 11: MARK TRANSACTION COMPLETED
    // ========================================================

    // Dono ledger entries successfully create ho gayi hain,
    // ab transaction ko COMPLETED mark kar sakte hain.
    const done = await transactionModel.updateStatus(
      t._id,
      "COMPLETED",
      client
    );

    // ========================================================
    // STEP 12: COMMIT
    // ========================================================

    // Ab tak ke saare SQL changes permanently save ho jayenge.
    await client.commit();

    // Email database commit ke BAAD bhej rahe hain.
    // External email service ko financial DB transaction ke andar nahi rakhna.
    await emailService.sendTransactionEmail(
      req.user.email,
      req.user.name,
      amount,
      toAccount
    );

    return res.status(201).json({
      message: "Transaction completed successfully",
      transaction: done
    });

  } catch (e) {
    // ========================================================
    // FAILURE → ROLLBACK
    // ========================================================

    // Agar transfer ke beech mein koi error aaya,
    // to DEBIT/CREDIT/PENDING sab uncommitted changes rollback ho jayenge.
    if (client) {
      try {
        await client.rollback();
      } catch (_) {}
    }

    // MySQL unique constraint violation.
    // Usually same idempotency key concurrent request se aa sakti hai.
    if (e.code === "ER_DUP_ENTRY") {
      const t = await transactionModel.findOne({
        idempotencyKey
      });

      if (t) {
        return existing(res, t);
      }

      return res.status(409).json({
        message: "Payment is already processing"
      });
    }

    if (e.message === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({
        message: "Insufficient balance"
      });
    }

    if (e.message === "ACCOUNT_NOT_FOUND") {
      return res.status(404).json({
        message: "Account not found"
      });
    }

    if (e.message === "ACCOUNT_NOT_ACTIVE") {
      return res.status(403).json({
        message:
          "sender and receiver account both should be Active"
      });
    }

    // Redlock contention.
    if (e.name === "ExecutionError") {
      return res.status(423).json({
        message:
          "Another transaction is already processing this account. Please retry."
      });
    }

    console.error("Transaction error:", e);

    return res.status(400).json({
      message: "Transaction failed due to an issue"
    });

  } finally {
    // MySQL connection ko pool mein wapas return karna.
    if (client) {
      client.release();
    }

    // Redis lock ko bhi release karna.
    // Finally mein rakhne se success/error dono cases mein cleanup hota hai.
    if (lock) {
      try {
        await lock.release();
      } catch (e) {
        console.error(
          "Failed to release Redis lock:",
          e.message
        );
      }
    }
  }
}

// ============================================================
// SYSTEM USER → INITIAL FUNDS
// ============================================================

async function createInitialFuncdstransaction(req, res) {
  const {
    toAccount,
    amount,
    idempotencyKey
  } = req.body;

  if (
    !toAccount ||
    amount === undefined ||
    !idempotencyKey
  ) {
    return res.status(400).json({
      message:
        "please provide all details. - toAccount, amount, idempotencyKey"
    });
  }

  if (
    !validId(toAccount) ||
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return res.status(400).json({
      message: "Invalid account or amount"
    });
  }

  // Duplicate initial-funds request ko bhi prevent karna hai.
  const old = await transactionModel.findOne({
    idempotencyKey
  });

  if (old) {
    return existing(res, old);
  }

  // System user ka account sender hoga.
  const from = await accountModel.findOne({
    user: req.user._id
  });

  const to = await accountModel.findOne({
    _id: toAccount
  });

  if (!from) {
    return res.status(400).json({
      message: "System User account not found"
    });
  }

  if (!to) {
    return res.status(400).json({
      message: "provide a valid receiver account"
    });
  }

  // Same distributed locking approach yahan bhi use hota hai.
  const keys = [
    `account:${from._id}`,
    `account:${toAccount}`
  ].sort();

  let lock;
  let client;

  try {
    lock = await redLock.acquire(keys, 10000);

    client = await pool.getConnection();

    // Initial funds bhi atomic operation hona chahiye.
    await client.beginTransaction();

    const t = await transactionModel.create(
      {
        fromAccount: from._id,
        toAccount,
        amount,
        idempotencyKey,
        status: "PENDING"
      },
      client
    );

    // System account se DEBIT.
    await ledgerModel.create(
      {
        account: from._id,
        amount,
        transaction: t._id,
        type: "DEBIT"
      },
      client
    );

    // User account ko CREDIT.
    await ledgerModel.create(
      {
        account: toAccount,
        amount,
        transaction: t._id,
        type: "CREDIT"
      },
      client
    );

    const done = await transactionModel.updateStatus(
      t._id,
      "COMPLETED",
      client
    );

    await client.commit();

    return res.status(201).json({
      message: "Initial Funds Transaction completed successfully",
      transaction: done
    });

  } catch (e) {
    if (client) {
      try {
        await client.rollback();
      } catch (_) {}
    }

    if (e.code === "ER_DUP_ENTRY") {
      const t = await transactionModel.findOne({
        idempotencyKey
      });

      if (t) {
        return existing(res, t);
      }
    }

    return res.status(400).json({
      message: "Initial funds transaction failed"
    });

  } finally {
    if (client) {
      client.release();
    }

    if (lock) {
      try {
        await lock.release();
      } catch (_) {}
    }
  }
}

module.exports = {
  createTransaction,
  createInitialFuncdstransaction
};