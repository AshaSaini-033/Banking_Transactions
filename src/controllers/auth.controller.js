const userModel = require("../models/user.model");
const jwt = require("jsonwebtoken");
const emailService = require("../services/email.service");
const { tokenBlackListModel } = require("../models/blacklist.model");

// ======================== REGISTER ========================

async function userRegisterController(req, res) {
  const { email, password, name } = req.body;

  // Basic validation.
  if (!email || !password || !name) {
    return res.status(400).json({
      message: "email, password and name are required"
    });
  }

  try {
    // Same email ka user already exist karta hai ya nahi.
    if (await userModel.findOne({ email })) {
      return res.status(422).json({
        message: "User Already Exists with this Email, Try Another email",
        status: "failed"
      });
    }

    // Model ke andar password bcrypt se hash hoga.
    // DB mein plaintext password nahi jayega.
    const u = await userModel.create({
      email,
      password,
      name
    });

    // Login ke bina immediately authenticated token create kar rahe hain.
    const token = jwt.sign(
      { userId: u._id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Token cookie mein store kar diya.
    res.cookie("token", token);

    res.status(201).json({
      message: "User Registered Successfully",
      user: {
        _id: u._id,
        email: u.email,
        name: u.name
      },
      token
    });

    // Registration successful hone ke baad email.
    await emailService.sendRegitrationEmail(u.email, u.name);

  } catch (e) {
    // PostgreSQL UNIQUE(email) violation.
    if (e.code === "23505") {
      return res.status(409).json({
        message: "Email already exists"
      });
    }

    console.error(e);
    return res.status(500).json({
      message: "Registration failed"
    });
  }
}

// ======================== LOGIN ========================

async function userLoginController(req, res) {
  const { email, password } = req.body;

  try {
    // Login ke waqt password hash bhi read karna hai,
    // isliye selectPassword=true pass kar rahe hain.
    const u = await userModel.findOne({
      email,
      selectPassword: true
    });

    if (!u || !(await u.comparePassword(password))) {
      return res.status(401).json({
        message: "Email or password is Invalid"
      });
    }

    // User authenticate ho gaya -> JWT create.
    const token = jwt.sign(
      { userId: u._id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Token client ko cookie mein de rahe hain.
    res.cookie("token", token);

    return res.status(200).json({
      user: {
        _id: u._id,
        email: u.email,
        name: u.name
      },
      token: {
        token
      }
    });

  } catch (e) {
    console.error(e);

    return res.status(500).json({
      message: "Login failed"
    });
  }
}

// ======================== LOGOUT ========================

async function userLogoutController(req, res) {
  // Token cookie ya Authorization header se mil sakta hai.
  const token =
    req.cookies.token ||
    req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(400).json({
      message: "Not valid user or invalid token"
    });
  }

  try {
    // JWT ko immediately invalidate karne ke liye blacklist table mein store.
    await tokenBlackListModel.create({ token });

    // Client cookie remove.
    res.clearCookie("token");

    return res.status(200).json({
      message: "user logged out successfully"
    });

  } catch (e) {
    return res.status(500).json({
      message: "Logout failed"
    });
  }
}

module.exports = {
  userRegisterController,
  userLoginController,
  userLogoutController
};