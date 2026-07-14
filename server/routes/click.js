// Click (SHOP API) integration — one-time UZS passes.
//
// Flow:
//   1. POST /api/click/create  (authenticated)  -> creates a pending transaction,
//      returns the Click hosted-checkout URL. The frontend redirects there.
//   2. Click calls POST /api/click/prepare  (server-to-server) to validate the order.
//   3. Click calls POST /api/click/complete (server-to-server) to confirm payment;
//      on success we grant the premium pass.
//
// Env-gated: dormant until CLICK_SERVICE_ID / CLICK_MERCHANT_ID / CLICK_SECRET_KEY are set.
//
// NOTE: signature/field handling follows the standard Click SHOP API spec. Confirm the
// exact field names and the amount format against Click's current docs + their sandbox
// during merchant onboarding before going live.

const express = require('express');
const crypto = require('crypto');
const { findOne, insertOne, updateOne } = require('../utils/storage');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const { DURATION_DAYS, UZS_PRICES, grantPremiumPass } = require('../utils/premium');

const router = express.Router();
const APP_URL = process.env.APP_URL || 'https://iwrite4.me';

function cfg() {
  return {
    serviceId: process.env.CLICK_SERVICE_ID,
    merchantId: process.env.CLICK_MERCHANT_ID,
    secretKey: process.env.CLICK_SECRET_KEY
  };
}
function clickReady() {
  const c = cfg();
  return !!(c.serviceId && c.merchantId && c.secretKey);
}

// Click error codes (subset we use).
const ERR = {
  SUCCESS: 0,
  SIGN_FAIL: -1,
  BAD_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  ORDER_NOT_FOUND: -5,
  TXN_NOT_FOUND: -6,
  FAILED_UPDATE: -7,
  BAD_REQUEST: -8,
  TXN_CANCELLED: -9
};

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

// Prepare:  md5(click_trans_id + service_id + secret_key + merchant_trans_id + amount + action + sign_time)
// Complete: md5(click_trans_id + service_id + secret_key + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
function signOk(b, secretKey) {
  const isComplete = String(b.action) === '1';
  const raw = String(b.click_trans_id) + String(b.service_id) + secretKey +
    String(b.merchant_trans_id) +
    (isComplete ? String(b.merchant_prepare_id) : '') +
    String(b.amount) + String(b.action) + String(b.sign_time);
  return md5(raw) === b.sign_string;
}

// ── 1. Create a pending order, return the Click checkout URL ──────────────────
router.post('/create', authenticate, async (req, res) => {
  try {
    if (!clickReady()) return res.status(503).json({ error: 'Click is not configured yet.' });
    const { duration } = req.body;
    if (!DURATION_DAYS[duration]) return res.status(400).json({ error: 'Invalid duration. Use 1m, 3m, or 6m.' });

    const amount = UZS_PRICES[duration];
    if (!amount) return res.status(503).json({ error: 'UZS price not set for this duration.' });

    const orderId = crypto.randomUUID();
    await insertOne('payment-transactions.json', {
      id: orderId,
      provider: 'click',
      userId: req.user.id,
      duration,
      amount,            // som
      state: 'pending',
      createdAt: new Date().toISOString()
    });

    const c = cfg();
    const returnUrl = `${APP_URL}/app.html?pay=click`;
    const url = `https://my.click.uz/services/pay?service_id=${c.serviceId}` +
      `&merchant_id=${c.merchantId}&amount=${amount}` +
      `&transaction_param=${orderId}&return_url=${encodeURIComponent(returnUrl)}`;

    res.json({ url, orderId });
  } catch (err) {
    logAction('click_create_error', { message: err.message });
    res.status(500).json({ error: 'Could not start Click payment.' });
  }
});

// ── 2. Prepare (server-to-server) ─────────────────────────────────────────────
router.post('/prepare', async (req, res) => {
  const c = cfg();
  if (!clickReady()) return res.json({ error: ERR.BAD_REQUEST, error_note: 'Not configured' });
  const b = req.body || {};

  if (!signOk(b, c.secretKey)) {
    return res.json({ click_trans_id: b.click_trans_id, merchant_trans_id: b.merchant_trans_id, error: ERR.SIGN_FAIL, error_note: 'SIGN CHECK FAILED' });
  }
  const txn = await findOne('payment-transactions.json', t => t.id === b.merchant_trans_id && t.provider === 'click');
  if (!txn) return res.json({ click_trans_id: b.click_trans_id, merchant_trans_id: b.merchant_trans_id, error: ERR.ORDER_NOT_FOUND, error_note: 'Order not found' });
  if (txn.state === 'paid') return res.json({ click_trans_id: b.click_trans_id, merchant_trans_id: b.merchant_trans_id, error: ERR.ALREADY_PAID, error_note: 'Already paid' });
  if (Math.abs(parseFloat(b.amount) - txn.amount) > 0.01) {
    return res.json({ click_trans_id: b.click_trans_id, merchant_trans_id: b.merchant_trans_id, error: ERR.BAD_AMOUNT, error_note: 'Incorrect amount' });
  }

  // Numeric prepare id Click will echo back in Complete.
  const merchantPrepareId = Date.now();
  await updateOne('payment-transactions.json', t => t.id === txn.id, {
    state: 'prepared',
    clickTransId: b.click_trans_id,
    merchantPrepareId,
    preparedAt: new Date().toISOString()
  });

  res.json({
    click_trans_id: b.click_trans_id,
    merchant_trans_id: b.merchant_trans_id,
    merchant_prepare_id: merchantPrepareId,
    error: ERR.SUCCESS,
    error_note: 'Success'
  });
});

// ── 3. Complete (server-to-server) → grant premium ────────────────────────────
router.post('/complete', async (req, res) => {
  const c = cfg();
  if (!clickReady()) return res.json({ error: ERR.BAD_REQUEST, error_note: 'Not configured' });
  const b = req.body || {};

  if (!signOk(b, c.secretKey)) {
    return res.json({ click_trans_id: b.click_trans_id, merchant_trans_id: b.merchant_trans_id, error: ERR.SIGN_FAIL, error_note: 'SIGN CHECK FAILED' });
  }
  const txn = await findOne('payment-transactions.json', t => t.id === b.merchant_trans_id && t.provider === 'click');
  if (!txn) return res.json({ click_trans_id: b.click_trans_id, merchant_trans_id: b.merchant_trans_id, error: ERR.TXN_NOT_FOUND, error_note: 'Transaction not found' });
  if (String(b.merchant_prepare_id) !== String(txn.merchantPrepareId)) {
    return res.json({ click_trans_id: b.click_trans_id, merchant_trans_id: b.merchant_trans_id, error: ERR.TXN_NOT_FOUND, error_note: 'Prepare id mismatch' });
  }

  // Click signals a failure/cancel with a negative `error`.
  if (parseInt(b.error, 10) < 0) {
    await updateOne('payment-transactions.json', t => t.id === txn.id, { state: 'cancelled', cancelledAt: new Date().toISOString() });
    return res.json({ click_trans_id: b.click_trans_id, merchant_trans_id: b.merchant_trans_id, merchant_confirm_id: txn.merchantPrepareId, error: ERR.TXN_CANCELLED, error_note: 'Cancelled' });
  }
  if (txn.state === 'paid') {
    return res.json({ click_trans_id: b.click_trans_id, merchant_trans_id: b.merchant_trans_id, merchant_confirm_id: txn.merchantPrepareId, error: ERR.ALREADY_PAID, error_note: 'Already paid' });
  }

  try {
    await grantPremiumPass(txn.userId, txn.duration, 'click', {
      lastPaymentProvider: 'click',
      lastPaymentAt: new Date().toISOString()
    });
    await updateOne('payment-transactions.json', t => t.id === txn.id, { state: 'paid', paidAt: new Date().toISOString() });
    logAction('click_payment_verified', { duration: txn.duration, amount: txn.amount, orderId: txn.id }, txn.userId);
  } catch (err) {
    logAction('click_grant_error', { orderId: txn.id, message: err.message }, txn.userId);
    return res.json({ click_trans_id: b.click_trans_id, merchant_trans_id: b.merchant_trans_id, error: ERR.FAILED_UPDATE, error_note: 'Could not grant premium' });
  }

  res.json({
    click_trans_id: b.click_trans_id,
    merchant_trans_id: b.merchant_trans_id,
    merchant_confirm_id: txn.merchantPrepareId,
    error: ERR.SUCCESS,
    error_note: 'Success'
  });
});

module.exports = router;
