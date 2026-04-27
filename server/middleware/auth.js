const jwt = require('jsonwebtoken');
const { findOne, findMany, updateOne } = require('../utils/storage');
const { logAction } = require('../utils/logger');

const SECRET = process.env.JWT_SECRET || 'iwrite-dev-secret-change-in-production';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    SECRET,
    { expiresIn: '7d' }
  );
}

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Downgrade a single user if their premium plan is expired. Returns true if downgraded.
// Applies to all sources (stripe/trial/promocode/manual) — webhooks were unreliable
// for trial-without-conversion, leaving users on premium indefinitely.
async function downgradeIfExpired(user) {
  if (!user || user.plan !== 'premium') return false;
  if (!user.planExpiresAt || user.planExpiresAt === 'infinite') return false;
  const expiresAt = new Date(user.planExpiresAt);
  if (expiresAt >= new Date()) return false;
  await updateOne('users.json', u => u.id === user.id, {
    plan: 'free',
    planExpired: true,
    planExpiredAt: new Date().toISOString()
  });
  logAction('subscription_expired', {
    userId: user.id,
    planDuration: user.planDuration,
    planSource: user.planSource,
    expiredAt: user.planExpiresAt
  }, 'system');
  return true;
}

// Check and auto-downgrade expired premium subscriptions on each /me request.
async function checkSubscriptionExpiry(req, res, next) {
  try {
    const user = await findOne('users.json', u => u.id === req.user.id);
    const downgraded = await downgradeIfExpired(user);
    if (downgraded) req.subscriptionExpired = true;
  } catch { /* non-critical — don't block the request */ }
  next();
}

// Background sweep: downgrade any premium user whose planExpiresAt has passed.
// Safety net for cases where webhooks never fire (e.g. Stripe trial ending without
// conversion does not emit customer.subscription.deleted).
async function sweepExpiredSubscriptions() {
  try {
    const now = new Date();
    const candidates = await findMany('users.json', u =>
      u.plan === 'premium' &&
      u.planExpiresAt &&
      u.planExpiresAt !== 'infinite' &&
      new Date(u.planExpiresAt) < now
    );
    let count = 0;
    for (const user of candidates) {
      if (await downgradeIfExpired(user)) count++;
    }
    if (count > 0) console.log(`[expiry-sweep] downgraded ${count} expired premium user(s)`);
  } catch (err) {
    console.error('[expiry-sweep] failed:', err.message || err);
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { generateToken, authenticate, checkSubscriptionExpiry, sweepExpiredSubscriptions, requireAdmin, SECRET };
