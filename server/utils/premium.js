// Shared premium-granting logic for one-time passes (Stripe, Click, Payme, Atmos).
// iWrite premium is time-bound: plan='premium' + planExpiresAt, auto-downgraded by the
// background sweep in middleware/auth.js. A "pass" simply pushes planExpiresAt forward.

const { findOne, updateOne } = require('./storage');

// Pass durations → days.
const DURATION_DAYS = { '1m': 30, '3m': 90, '6m': 180 };

// Local (UZS, in som) prices per duration, set via Railway env vars. 0 = not configured
// (the provider routes refuse to create a charge until a real price is set).
const UZS_PRICES = {
  '1m': parseInt(process.env.PRICE_UZS_1M || '0', 10),
  '3m': parseInt(process.env.PRICE_UZS_3M || '0', 10),
  '6m': parseInt(process.env.PRICE_UZS_6M || '0', 10)
};

// Amount Payme/Atmos expect is in tiyin (1 som = 100 tiyin).
function somToTiyin(som) { return Math.round(som * 100); }

// Grant (or extend) a premium pass. Extends from the LATER of now or the user's current
// expiry, so re-paying before a pass ends stacks the time instead of truncating it.
async function grantPremiumPass(userId, durationCode, source, extra = {}) {
  const days = DURATION_DAYS[durationCode];
  if (!days) throw new Error(`Unknown duration code: ${durationCode}`);

  const user = await findOne('users.json', u => u.id === userId);
  if (!user) throw new Error('User not found');

  const now = new Date();
  const currentExpiry = (user.planExpiresAt && user.planExpiresAt !== 'infinite')
    ? new Date(user.planExpiresAt)
    : null;
  const base = (currentExpiry && currentExpiry > now) ? currentExpiry : now;
  const expiresAt = new Date(base.getTime() + days * 86400000).toISOString();

  const updates = {
    plan: 'premium',
    planDuration: durationCode,
    planStartedAt: now.toISOString(),
    planExpiresAt: expiresAt,
    planSource: source,
    planPaymentFailed: false,
    planPaymentAttempts: 0,
    ...extra
  };

  await updateOne('users.json', u => u.id === userId, updates);
  return { expiresAt, updates };
}

module.exports = { DURATION_DAYS, UZS_PRICES, somToTiyin, grantPremiumPass };
