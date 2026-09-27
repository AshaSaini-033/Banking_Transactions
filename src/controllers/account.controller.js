const accountModel = require("../models/account.model");

// User ke liye naya bank account create karta hai.
async function createAccountController(req, res) {
  try {
    // authMiddleware ne JWT verify karke req.user set kiya hai.
    const account = await accountModel.create({ user: req.user._id });

    return res.status(201).json({
      message: "account created",
      account
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to create account" });
  }
}

// Logged-in user ke saare accounts fetch karta hai.
async function getuserAccountsController(req, res) {
  try {
    const accounts = await accountModel.find({ user: req.user._id });
    return res.status(200).json({ accounts });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to fetch accounts" });
  }
}

// Account ka balance ledger se calculate karta hai.
async function getuserAccountsBalanceController(req, res) {
  try {
    const { accountId } = req.params;

    // Account sirf tab return hoga jab woh current user ka ho.
    const account = await accountModel.findOne({
      _id: accountId,
      user: req.user._id
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const balance = await accountModel.getBalance(account._id);

    return res.status(200).json({
      accountId: account._id,
      balance
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to fetch balance" });
  }
}

module.exports = {
  createAccountController,
  getuserAccountsController,
  getuserAccountsBalanceController
};