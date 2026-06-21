// ATMOS — "pay by card" (UZCARD / HUMO / Visa / Mastercard). One-time UZS passes.
//
// Direct card flow (user types their card):
//   1. POST /api/atmos/create    (auth)  -> pending order + Atmos transaction
//   2. POST /api/atmos/pre-apply (auth)  -> send card_number+expiry, Atmos texts an OTP
//   3. POST /api/atmos/apply     (auth)  -> submit OTP, charge completes, grant premium
//
// Env-gated: dormant until ATMOS_CONSUMER_KEY / ATMOS_CONSUMER_SECRET / ATMOS_STORE_ID set.
// Amounts to Atmos are in TIYIN.
//
// ⚠️ PCI NOTE: this direct flow means the card number passes through iWrite's server,
// which raises PCI scope (SAQ A-EP+). The lower-burden alternative is Atmos's HOSTED card
// page (PAN never touches us, SAQ A). Decide which before enabling — see PAYMENTS.md.
// Endpoint paths/field names below follow the standard Atmos API; confirm against
// docs.atmos.uz during onboarding.

const express = require('express');
const crypto = require('crypto');
const { findOne, insertOne, updateOne } = require('../utils/storage');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const { DURATION_DAYS, UZS_PRICES, somToTiyin, grantPremiumPass } = require('../utils/premium');

const router = express.Router();
const BASE = process.env.ATMOS_BASE || 'https://partner.atmos.uz';

function cfg() {
  return {
    key: process.env.ATMOS_CONSUMER_KEY,
    secret: process.env.ATMOS_CONSUMER_SECRET,
    storeId: process.env.ATMOS_STORE_ID
  };
}
function atmosReady() { const c = cfg(); return !!(c.key && c.secret && c.storeId); }

// ── OAuth token (client credentials), cached until ~1 min before expiry ──
let _token = null, _tokenExp = 0;
async function getToken() {
  if (_token && Date.now() < _tokenExp - 60000) return _token;
  const c = cfg();
  const basic = Buffer.from(`${c.key}:${c.secret}`).toString('base64');
  const resp = await fetch(`${BASE}/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error('Atmos token failed');
  _token = data.access_token;
  _tokenExp = Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600000);
  return _token;
}
async function atmosPost(path, body) {
  const token = await getToken();
  const resp = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return resp.json();
}

// ── 1. Create order + Atmos transaction ──
router.post('/create', authenticate, async (req, res) => {
  try {
    if (!atmosReady()) return res.status(503).json({ error: 'Card payments are not configured yet.' });
    const { duration } = req.body;
    if (!DURATION_DAYS[duration]) return res.status(400).json({ error: 'Invalid duration. Use 1m, 3m, or 6m.' });
    const som = UZS_PRICES[duration];
    if (!som) return res.status(503).json({ error: 'UZS price not set for this duration.' });

    const amountTiyin = somToTiyin(som);
    const orderId = crypto.randomUUID();
    await insertOne('payment-transactions.json', {
      id: orderId, provider: 'atmos', userId: req.user.id, duration,
      amount: som, amountTiyin, state: 'pending', createdAt: new Date().toISOString()
    });

    const c = cfg();
    const created = await atmosPost('/merchant/pay/create', {
      amount: amountTiyin, account: orderId, store_id: c.storeId, lang: 'ru'
    });
    const atmosTxnId = created.transaction_id || created.transactionId;
    if (!atmosTxnId) {
      await updateOne('payment-transactions.json', t => t.id === orderId, { state: 'failed', atmosError: created });
      return res.status(502).json({ error: 'Could not start card payment.' });
    }
    await updateOne('payment-transactions.json', t => t.id === orderId, { atmosTxnId, state: 'created' });
    res.json({ orderId });
  } catch (err) {
    logAction('atmos_create_error', { message: err.message });
    res.status(500).json({ error: 'Could not start card payment.' });
  }
});

// ── 2. Send card → Atmos texts an OTP to the cardholder ──
router.post('/pre-apply', authenticate, async (req, res) => {
  try {
    if (!atmosReady()) return res.status(503).json({ error: 'Card payments are not configured yet.' });
    const { orderId, cardNumber, expiry } = req.body;
    const order = await findOne('payment-transactions.json', t => t.id === orderId && t.provider === 'atmos' && t.userId === req.user.id);
    if (!order || !order.atmosTxnId) return res.status(404).json({ error: 'Order not found.' });
    if (order.state === 'paid') return res.status(409).json({ error: 'Already paid.' });

    const result = await atmosPost('/merchant/pay/pre-apply', {
      transaction_id: order.atmosTxnId,
      card_number: String(cardNumber || '').replace(/\s+/g, ''),
      expiry: String(expiry || '').replace(/\D/g, '')
    });
    if (result && (result.status === 'success' || result.result?.code === 'OK' || result.otp_sent)) {
      return res.json({ otpSent: true });
    }
    res.status(400).json({ error: result?.message || result?.result?.description || 'Card was declined.' });
  } catch (err) {
    logAction('atmos_preapply_error', { message: err.message });
    res.status(500).json({ error: 'Could not process the card.' });
  }
});

// ── 3. Submit OTP → charge completes → grant premium ──
router.post('/apply', authenticate, async (req, res) => {
  try {
    if (!atmosReady()) return res.status(503).json({ error: 'Card payments are not configured yet.' });
    const { orderId, otp } = req.body;
    const order = await findOne('payment-transactions.json', t => t.id === orderId && t.provider === 'atmos' && t.userId === req.user.id);
    if (!order || !order.atmosTxnId) return res.status(404).json({ error: 'Order not found.' });
    if (order.state === 'paid') return res.json({ success: true, alreadyPaid: true });

    const result = await atmosPost('/merchant/pay/apply', {
      transaction_id: order.atmosTxnId,
      otp: String(otp || '').replace(/\D/g, '')
    });
    const ok = result && (result.status === 'success' || result.result?.code === 'OK' || result.success);
    if (!ok) {
      return res.status(400).json({ error: result?.message || result?.result?.description || 'Incorrect code.' });
    }

    await grantPremiumPass(order.userId, order.duration, 'atmos', {
      lastPaymentProvider: 'atmos', lastPaymentAt: new Date().toISOString()
    });
    await updateOne('payment-transactions.json', t => t.id === order.id, { state: 'paid', paidAt: new Date().toISOString() });
    logAction('atmos_payment_verified', { duration: order.duration, amount: order.amount, orderId: order.id }, order.userId);
    res.json({ success: true });
  } catch (err) {
    logAction('atmos_apply_error', { message: err.message });
    res.status(500).json({ error: 'Could not confirm the payment.' });
  }
});

module.exports = router;
