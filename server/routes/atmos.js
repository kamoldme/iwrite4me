// ATMOS — "pay by card" (UZCARD / HUMO / Visa / Mastercard) via the HOSTED checkout.
// One-time UZS passes.
//
//   1. POST /api/atmos/create   (auth)            -> pending order + Atmos transaction,
//      returns the hosted checkout URL. The frontend redirects there; the card number is
//      entered on Atmos's PCI-compliant page and never touches iWrite (PCI SAQ A).
//   2. POST /api/atmos/callback (server-to-server) -> on success, grant the premium pass.
//
// Env-gated: dormant until ATMOS_CONSUMER_KEY / ATMOS_CONSUMER_SECRET / ATMOS_STORE_ID set.
// Amounts to Atmos are in TIYIN.
//
// NOTE: the create-response field that carries the hosted URL, and the callback's payload +
// signature, must be confirmed against docs.atmos.uz during onboarding. The structure here
// follows the standard Atmos flow.

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

// OAuth token (client credentials), cached until ~1 min before expiry.
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

// ── 1. Create order + Atmos transaction, return the hosted checkout URL ──
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
    // The hosted-page URL is usually returned by create; fall back to the standard pattern.
    const checkoutUrl = created.redirect_url || created.url || created.pay_url
      || (atmosTxnId ? `${BASE}/merchant/pay/checkout/${atmosTxnId}` : null);
    if (!checkoutUrl) {
      await updateOne('payment-transactions.json', t => t.id === orderId, { state: 'failed', atmosError: created });
      return res.status(502).json({ error: 'Could not start card payment.' });
    }
    await updateOne('payment-transactions.json', t => t.id === orderId, { atmosTxnId, state: 'created' });
    res.json({ url: checkoutUrl, orderId });
  } catch (err) {
    logAction('atmos_create_error', { message: err.message });
    res.status(500).json({ error: 'Could not start card payment.' });
  }
});

// ── 2. Atmos success callback (server-to-server) → grant premium ──
router.post('/callback', async (req, res) => {
  try {
    if (!atmosReady()) return res.status(503).json({ status: 0 });
    // TODO(onboarding): verify the Atmos signature on this payload before trusting it.
    const b = req.body || {};
    const txnId = b.transaction_id || b.transactionId || b.invoice;
    const order = await findOne('payment-transactions.json', t => t.atmosTxnId === txnId && t.provider === 'atmos');
    if (!order) return res.json({ status: 0, message: 'Order not found' });

    const success = b.status === 1 || b.status === 'success' || b.success === true;
    if (success && order.state !== 'paid') {
      await grantPremiumPass(order.userId, order.duration, 'atmos', {
        lastPaymentProvider: 'atmos', lastPaymentAt: new Date().toISOString()
      });
      await updateOne('payment-transactions.json', t => t.id === order.id, { state: 'paid', paidAt: new Date().toISOString() });
      logAction('atmos_payment_verified', { duration: order.duration, amount: order.amount, orderId: order.id }, order.userId);
    }
    res.json({ status: 1 });
  } catch (err) {
    logAction('atmos_callback_error', { message: err.message });
    res.json({ status: 0 });
  }
});

module.exports = router;
