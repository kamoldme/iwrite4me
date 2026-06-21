// Payme (Paycom) Merchant API — JSON-RPC 2.0. One-time UZS passes.
//
//   1. POST /api/payme/create (authenticated) -> creates a pending order, returns the
//      Payme checkout URL (https://checkout.paycom.uz/<base64 m;ac.order_id;a;c>).
//   2. Payme calls POST /api/payme (server-to-server) with Basic auth and the JSON-RPC
//      methods below. On PerformTransaction we grant the premium pass.
//
// Env-gated: dormant until PAYME_MERCHANT_ID + PAYME_KEY are set.
// Amounts on the wire are in TIYIN (1 som = 100 tiyin). Always responds HTTP 200.
//
// NOTE: implemented to the standard Merchant API spec; Payme runs a strict sandbox
// compliance check against this endpoint before activating the cashbox. Verify field
// names / behavior there during onboarding.

const express = require('express');
const crypto = require('crypto');
const { findOne, findMany, insertOne, updateOne } = require('../utils/storage');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const { DURATION_DAYS, UZS_PRICES, somToTiyin, grantPremiumPass } = require('../utils/premium');

const router = express.Router();
const APP_URL = process.env.APP_URL || 'https://iwrite4.me';
const ACCOUNT_FIELD = 'order_id';

function cfg() {
  return { merchantId: process.env.PAYME_MERCHANT_ID, key: process.env.PAYME_KEY };
}
function paymeReady() { const c = cfg(); return !!(c.merchantId && c.key); }

// Payme transaction states
const STATE = { CREATED: 1, PERFORMED: 2, CANCELLED: -1, CANCELLED_AFTER_PERFORM: -2 };

function rpcError(code, message, data) {
  const err = { code, message: { ru: message, uz: message, en: message } };
  if (data !== undefined) err.data = data;
  return err;
}

// ── 1. Create a pending order, return the Payme checkout URL ──────────────────
router.post('/create', authenticate, async (req, res) => {
  try {
    if (!paymeReady()) return res.status(503).json({ error: 'Payme is not configured yet.' });
    const { duration } = req.body;
    if (!DURATION_DAYS[duration]) return res.status(400).json({ error: 'Invalid duration. Use 1m, 3m, or 6m.' });
    const som = UZS_PRICES[duration];
    if (!som) return res.status(503).json({ error: 'UZS price not set for this duration.' });

    const amountTiyin = somToTiyin(som);
    const orderId = crypto.randomUUID();
    await insertOne('payment-transactions.json', {
      id: orderId, provider: 'payme', userId: req.user.id, duration,
      amount: som, amountTiyin, state: 'pending', createdAt: new Date().toISOString()
    });

    const c = cfg();
    const returnUrl = `${APP_URL}/app.html?pay=payme`;
    const raw = `m=${c.merchantId};ac.${ACCOUNT_FIELD}=${orderId};a=${amountTiyin};c=${returnUrl}`;
    const url = `https://checkout.paycom.uz/${Buffer.from(raw).toString('base64')}`;
    res.json({ url, orderId });
  } catch (err) {
    logAction('payme_create_error', { message: err.message });
    res.status(500).json({ error: 'Could not start Payme payment.' });
  }
});

// ── 2. JSON-RPC endpoint (server-to-server) ───────────────────────────────────
router.post('/', async (req, res) => {
  const c = cfg();
  const id = (req.body && req.body.id) || null;
  if (!paymeReady()) return res.json({ jsonrpc: '2.0', id, error: rpcError(-32504, 'Not configured') });

  // Basic auth: base64("Paycom:" + key)
  const auth = req.headers.authorization || '';
  const decoded = auth.startsWith('Basic ') ? Buffer.from(auth.slice(6), 'base64').toString() : '';
  if (decoded !== `Paycom:${c.key}`) {
    return res.json({ jsonrpc: '2.0', id, error: rpcError(-32504, 'Insufficient privilege to perform this method') });
  }

  const { method, params } = req.body || {};
  const reply = (result) => res.json({ jsonrpc: '2.0', id, result });
  const fail = (error) => res.json({ jsonrpc: '2.0', id, error });

  try {
    switch (method) {
      case 'CheckPerformTransaction': return await checkPerform(params, reply, fail);
      case 'CreateTransaction':       return await createTransaction(params, reply, fail);
      case 'PerformTransaction':      return await performTransaction(params, reply, fail);
      case 'CancelTransaction':       return await cancelTransaction(params, reply, fail);
      case 'CheckTransaction':        return await checkTransaction(params, reply, fail);
      case 'GetStatement':            return await getStatement(params, reply, fail);
      default:                        return fail(rpcError(-32601, 'Method not found'));
    }
  } catch (err) {
    logAction('payme_method_error', { method, message: err.message });
    return fail(rpcError(-31008, 'Unable to complete operation'));
  }
});

async function findOrderByAccount(params) {
  const orderId = params && params.account && params.account[ACCOUNT_FIELD];
  if (!orderId) return null;
  return findOne('payment-transactions.json', t => t.id === orderId && t.provider === 'payme');
}
async function findOrderByTxn(params) {
  return findOne('payment-transactions.json', t => t.paymeTransId === (params && params.id) && t.provider === 'payme');
}

async function checkPerform(params, reply, fail) {
  const order = await findOrderByAccount(params);
  if (!order) return fail(rpcError(-31050, 'Order not found', ACCOUNT_FIELD));
  if (order.state === 'paid') return fail(rpcError(-31051, 'Order already paid', ACCOUNT_FIELD));
  if (params.amount !== order.amountTiyin) return fail(rpcError(-31001, 'Invalid amount'));
  return reply({ allow: true });
}

async function createTransaction(params, reply, fail) {
  const order = await findOrderByAccount(params);
  if (!order) return fail(rpcError(-31050, 'Order not found', ACCOUNT_FIELD));
  if (params.amount !== order.amountTiyin) return fail(rpcError(-31001, 'Invalid amount'));

  if (order.paymeTransId) {
    if (order.paymeTransId === params.id) {
      return reply({ create_time: order.paymeCreateTime, transaction: order.id, state: order.paymeState });
    }
    return fail(rpcError(-31050, 'Order is already in another transaction', ACCOUNT_FIELD));
  }
  if (order.state === 'paid') return fail(rpcError(-31051, 'Order already paid', ACCOUNT_FIELD));

  const createTime = Date.now();
  await updateOne('payment-transactions.json', t => t.id === order.id, {
    paymeTransId: params.id, paymeTime: params.time, paymeCreateTime: createTime,
    paymeState: STATE.CREATED, state: 'created'
  });
  return reply({ create_time: createTime, transaction: order.id, state: STATE.CREATED });
}

async function performTransaction(params, reply, fail) {
  const order = await findOrderByTxn(params);
  if (!order) return fail(rpcError(-31003, 'Transaction not found'));
  if (order.paymeState === STATE.PERFORMED) {
    return reply({ transaction: order.id, perform_time: order.paymePerformTime, state: STATE.PERFORMED });
  }
  if (order.paymeState !== STATE.CREATED) return fail(rpcError(-31008, 'Unable to perform in current state'));

  const performTime = Date.now();
  await grantPremiumPass(order.userId, order.duration, 'payme', {
    lastPaymentProvider: 'payme', lastPaymentAt: new Date().toISOString()
  });
  await updateOne('payment-transactions.json', t => t.id === order.id, {
    paymeState: STATE.PERFORMED, paymePerformTime: performTime, state: 'paid', paidAt: new Date().toISOString()
  });
  logAction('payme_payment_verified', { duration: order.duration, amount: order.amount, orderId: order.id }, order.userId);
  return reply({ transaction: order.id, perform_time: performTime, state: STATE.PERFORMED });
}

async function cancelTransaction(params, reply, fail) {
  const order = await findOrderByTxn(params);
  if (!order) return fail(rpcError(-31003, 'Transaction not found'));
  const cancelTime = order.paymeCancelTime || Date.now();
  const newState = order.paymeState === STATE.PERFORMED ? STATE.CANCELLED_AFTER_PERFORM : STATE.CANCELLED;
  // NOTE: cancelling an already-performed pass is effectively a refund. We record it and
  // leave premium in place; revoking a granted pass is handled manually by an admin for now.
  await updateOne('payment-transactions.json', t => t.id === order.id, {
    paymeState: newState, paymeCancelTime: cancelTime, paymeCancelReason: params.reason, state: 'cancelled'
  });
  return reply({ transaction: order.id, cancel_time: cancelTime, state: newState });
}

async function checkTransaction(params, reply, fail) {
  const order = await findOrderByTxn(params);
  if (!order) return fail(rpcError(-31003, 'Transaction not found'));
  return reply({
    create_time: order.paymeCreateTime || 0,
    perform_time: order.paymePerformTime || 0,
    cancel_time: order.paymeCancelTime || 0,
    transaction: order.id,
    state: order.paymeState,
    reason: order.paymeCancelReason !== undefined ? order.paymeCancelReason : null
  });
}

async function getStatement(params, reply) {
  const all = await findMany('payment-transactions.json');
  const txns = all
    .filter(t => t.provider === 'payme' && t.paymeTime && t.paymeTime >= params.from && t.paymeTime <= params.to)
    .map(o => ({
      id: o.paymeTransId,
      time: o.paymeTime,
      amount: o.amountTiyin,
      account: { [ACCOUNT_FIELD]: o.id },
      create_time: o.paymeCreateTime || 0,
      perform_time: o.paymePerformTime || 0,
      cancel_time: o.paymeCancelTime || 0,
      transaction: o.id,
      state: o.paymeState,
      reason: o.paymeCancelReason !== undefined ? o.paymeCancelReason : null
    }));
  return reply({ transactions: txns });
}

module.exports = router;
