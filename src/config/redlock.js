const { default: Redlock } = require("redlock");
const redis = require("./redis");

// Redlock Redis ke upar distributed lock implement karta hai.
// Multiple server instances same account par conflicting transaction
// ko ek saath critical section mein enter karne se rok sakte hain.
const redLock = new Redlock([redis], {
  retryCount: 10,
  retryDelay: 200,
  retryJitter: 100
});

module.exports = redLock;