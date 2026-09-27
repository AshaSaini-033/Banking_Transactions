const jwt = require("jsonwebtoken");
const userModel = require("../models/user.model");
const { tokenBlackListModel } = require("../models/blacklist.model");

// Cookie ya Authorization header se JWT nikalta hai.
function token(req) {
  return req.cookies.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null);
}

// Ye middleware protected APIs se pehle run hota hai.
async function authMiddleware(req, res, next) {
  const t = token(req);

  if (!t) {
    return res.status(401).json({
      message: "Authorization token required or invalid format"
    });
  }

  try {
    // Logout ke baad token blacklist table mein store hota hai.
    // Isliye valid JWT hone ke baad bhi blacklisted token reject hoga.
    if (await tokenBlackListModel.findOne({ token: t })) {
      return res.status(401).json({
        message: "Unauthorized access, token is not valid"
      });
    }

    // JWT ke andar userId hota hai.
    const decoded = jwt.verify(t, process.env.JWT_SECRET);

    // User PostgreSQL se dobara fetch karte hain.
    const user = await userModel.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    // Ab controllers ko logged-in user mil jayega.
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({
      message: "Invalid or expired token"
    });
  }
}

// Ye middleware sirf system-user APIs ke liye hai.
async function systemUserAuthMiddleware(req, res, next) {
  const t = token(req);

  if (!t) {
    return res.status(401).json({
      message: "Authorization token required or invalid format"
    });
  }

  try {
    if (await tokenBlackListModel.findOne({ token: t })) {
      return res.status(401).json({
        message: "Unauthorized access, token is not valid"
      });
    }

    const decoded = jwt.verify(t, process.env.JWT_SECRET);

    // System user field specifically select kar rahe hain.
    const user = await userModel.findById(
      decoded.userId,
      { selectSystemUser: true }
    );

    if (!user) {
      return res.status(401).json({
        message: "User no longer exists"
      });
    }

    if (!user.systemUser) {
      return res.status(403).json({
        message: "Forbidden access, not a system user"
      });
    }

    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({
      message: "Invalid or expired token"
    });
  }
}

module.exports = {
  authMiddleware,
  systemUserAuthMiddleware
};