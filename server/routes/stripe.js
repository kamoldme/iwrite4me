const express = require('express');
const Stripe = require('stripe');
const { findOne, findMany, updateOne } = require('../utils/storage');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../utils/logger');

const router = express.Router();
let stripeClient = null;

const APP_URL = process.env.APP_URL || 'https://iwrite4.me';

// Map duration codes to Stripe Price IDs
const PRICE_MAP = {
  '1m': process.env.STRIPE_PRICE_1M,
  '3m': process.env.STRIPE_PRICE_3M,
  '6m': process.env.STRIPE_PRICE_6M
};

// Duration in days for planExpiresAt calculation
const DURATION_DAYS = {
  '1m': 30,
  '3m': 90,
  '6m': 180
};

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
  }
  return stripeClient;
}

function requireStripe(res) {
  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: 'Stripe billing is not configured right now.' });
    return null;
  }
  return stripe;
}

// ─────────────────────────────────────────────
// POST /api/stripe/create-checkout-session
// Creates a Stripe Checkout Session and returns the URL
// ─────────────────────────────────────────────
router.post('/create-checkout-session', authenticate, async (req, res) => {
  try {
    const stripe = requireStripe(res);
    if (!stripe) return;

    const { duration, trial } = req.body;

    if (!duration || !PRICE_MAP[duration]) {
      return res.status(400).json({ error: 'Invalid duration. Use 1m, 3m, or 6m.' });
    }

    const priceId = PRICE_MAP[duration];
    if (!priceId) {
      return res.status(500).json({ error: 'Stripe price not configured for this duration.' });
    }

    const user = await findOne('users.json', u => u.id === req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Trial guard: only allow if user has never used a trial
    if (trial && user.trialUsed) {
      return res.status(400).json({ error: 'You have already used your free trial.' });
    }

    // Belt-and-suspenders: if local flag is missing but Stripe shows a prior
    // trial subscription on this customer, mark trialUsed and reject.
    // Catches edge cases where webhook never fired or flag was reset.
    if (trial && user.stripeCustomerId) {
      try {
        const subs = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'all',
          limit: 100
        });
        const hadTrial = subs.data.some(s => s.trial_start || s.trial_end);
        if (hadTrial) {
          await updateOne('users.json', u => u.id === user.id, { trialUsed: true });
          return res.status(400).json({ error: 'You have already used your free trial.' });
        }
      } catch (err) {
        console.warn('Stripe trial-history check failed:', err.message);
      }
    }

    // Build the checkout session config
    const sessionConfig = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}/app.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/app.html#upgrade`,
      allow_promotion_codes: true,
      metadata: {
        userId: user.id,
        duration
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          duration
        }
      }
    };

    // If user already has a Stripe customer ID, reuse it
    if (user.stripeCustomerId) {
      sessionConfig.customer = user.stripeCustomerId;
    } else {
      sessionConfig.customer_email = user.email;
    }

    // Add trial period if requested
    if (trial) {
      sessionConfig.subscription_data.trial_period_days = 7;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    logAction('stripe_checkout_created', {
      duration,
      trial: !!trial,
      sessionId: session.id
    }, user.id);

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ─────────────────────────────────────────────
// GET /api/stripe/verify-session
// Verifies payment on user return (handles race condition where
// user returns before webhook fires)
// ─────────────────────────────────────────────
router.get('/verify-session', authenticate, async (req, res) => {
  try {
    const stripe = requireStripe(res);
    if (!stripe) return;

    const { session_id } = req.query;
    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription']
    });

    if (session.payment_status !== 'paid' && !session.subscription?.trial_end) {
      return res.json({ success: false, status: session.payment_status });
    }

    const userId = session.metadata?.userId;
    if (!userId || userId !== req.user.id) {
      return res.status(403).json({ error: 'Session does not belong to this user' });
    }

    const user = await findOne('users.json', u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Idempotency: if already processed, skip
    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

    if (user.stripeSubscriptionId === subscriptionId) {
      return res.json({ success: true, plan: 'premium', alreadyProcessed: true });
    }

    // Apply the subscription
    const duration = session.metadata?.duration || '1m';
    const now = new Date();
    const subscription = typeof session.subscription === 'object'
      ? session.subscription
      : await stripe.subscriptions.retrieve(session.subscription);

    const isTrial = subscription.trial_end && subscription.trial_end > Math.floor(Date.now() / 1000);
    const expiresAt = isTrial
      ? new Date(subscription.trial_end * 1000).toISOString()
      : new Date(now.getTime() + DURATION_DAYS[duration] * 86400000).toISOString();

    const updates = {
      plan: 'premium',
      planDuration: duration,
      planStartedAt: now.toISOString(),
      planExpiresAt: expiresAt,
      planSource: isTrial ? 'trial' : 'stripe',
      stripeCustomerId: session.customer,
      stripeSubscriptionId: subscriptionId,
      planPaymentFailed: false,
      planPaymentAttempts: 0
    };

    if (isTrial) {
      updates.trialUsed = true;
      updates.trialEndingAt = new Date(subscription.trial_end * 1000).toISOString();
    }

    await updateOne('users.json', u => u.id === userId, updates);

    logAction('stripe_payment_verified', {
      duration,
      source: updates.planSource,
      sessionId: session.id
    }, userId);

    res.json({ success: true, plan: 'premium', source: updates.planSource });
  } catch (err) {
    console.error('Stripe verify error:', err);
    res.status(500).json({ error: 'Failed to verify session' });
  }
});

// ─────────────────────────────────────────────
// POST /api/stripe/create-portal-session
// Creates a Stripe Customer Portal session for billing management
// ─────────────────────────────────────────────
router.post('/create-portal-session', authenticate, async (req, res) => {
  try {
    const stripe = requireStripe(res);
    if (!stripe) return;

    const user = await findOne('users.json', u => u.id === req.user.id);
    if (!user || !user.stripeCustomerId) {
      return res.status(400).json({ error: 'No Stripe billing account found' });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${APP_URL}/app.html#upgrade`
    });

    res.json({ url: portalSession.url });
  } catch (err) {
    console.error('Stripe portal error:', err);
    res.status(500).json({ error: 'Failed to create billing portal session' });
  }
});

// ─────────────────────────────────────────────
// GET /api/stripe/history
// Returns a chronological subscription history for the current user.
// Pulls from internal logs (covers trial/admin/promocode/referral grants)
// and merges Stripe invoices when the user has a stripeCustomerId
// (gives real paid amounts).
// ─────────────────────────────────────────────
router.get('/history', authenticate, async (req, res) => {
  try {
    const user = await findOne('users.json', u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const STRIPE_ACTIONS = new Set([
      'stripe_subscription_created',
      'stripe_subscription_renewed',
      'stripe_subscription_cancelled',
      'stripe_subscription_auto_cancelled',
      'stripe_payment_failed',
      'stripe_payment_verified',
      'subscription_expired',
      'promocode_redeemed',
      'admin_grant_pro',
      'referral_pro_granted'
    ]);

    const allLogs = await findMany('logs.json', l =>
      l.userId === user.id && STRIPE_ACTIONS.has(l.action)
    );

    const stripe = getStripe();
    const hasStripeData = !!(stripe && user.stripeCustomerId);

    // When we have Stripe invoice data, suppress log entries that duplicate
    // what the invoices already describe (signup/verify/renewal). Keep the
    // log-only event types that have no invoice equivalent.
    const REDUNDANT_WHEN_STRIPE = new Set([
      'stripe_subscription_created',
      'stripe_subscription_renewed',
      'stripe_payment_verified'
    ]);
    const filteredLogs = hasStripeData
      ? allLogs.filter(l => !REDUNDANT_WHEN_STRIPE.has(l.action))
      : allLogs;

    const events = filteredLogs.map(l => ({
      type: l.action,
      timestamp: l.timestamp,
      duration: l.details?.duration || null,
      source: l.details?.source || null,
      subscriptionId: l.details?.subscriptionId || null,
      details: l.details || {}
    }));

    // Merge in Stripe invoices for real payment amounts
    if (hasStripeData) {
      try {
        const invoices = await stripe.invoices.list({
          customer: user.stripeCustomerId,
          limit: 50
        });

        // Cache: fetch each unique subscription once to read trial_start/trial_end
        const subCache = {};
        const getSub = async (subId) => {
          if (!subId) return null;
          if (subCache[subId] !== undefined) return subCache[subId];
          try { subCache[subId] = await stripe.subscriptions.retrieve(subId); }
          catch { subCache[subId] = null; }
          return subCache[subId];
        };

        for (const inv of invoices.data) {
          if (inv.status !== 'paid' && inv.status !== 'open') continue;

          const totalDiscount = (inv.total_discount_amounts || []).reduce((s, d) => s + d.amount, 0);
          const subtotal = inv.subtotal || 0;
          const lineSubtotal = (inv.lines?.data || []).reduce((s, l) => s + (l.amount || 0), 0);
          const isFullyDiscounted = totalDiscount > 0 && inv.amount_paid === 0 && lineSubtotal > 0;

          const couponName = inv.discount?.coupon?.name || null;
          const couponPercent = inv.discount?.coupon?.percent_off || null;
          const couponAmountOff = inv.discount?.coupon?.amount_off || null;

          // Detect trial: invoice was created during the subscription's trial window
          let isTrial = false;
          if (inv.subscription) {
            const sub = await getSub(inv.subscription);
            if (sub?.trial_start && sub?.trial_end) {
              isTrial = inv.created >= sub.trial_start && inv.created <= sub.trial_end;
            }
          }

          events.push({
            type: 'stripe_invoice',
            timestamp: new Date((inv.status_transitions?.paid_at || inv.created) * 1000).toISOString(),
            duration: null,
            source: 'stripe',
            subscriptionId: inv.subscription || null,
            details: {
              amountPaid: inv.amount_paid,
              subtotal,
              currency: inv.currency,
              status: inv.status,
              billingReason: inv.billing_reason,
              hostedInvoiceUrl: inv.hosted_invoice_url,
              periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
              periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
              isTrial,
              isFullyDiscounted,
              couponName,
              couponPercent,
              couponAmountOff,
              discountAmount: totalDiscount
            }
          });
        }
      } catch (err) {
        console.warn('Stripe invoice fetch failed:', err.message);
      }
    }

    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      events,
      currentPlan: {
        plan: user.plan,
        planSource: user.planSource || null,
        planDuration: user.planDuration || null,
        planStartedAt: user.planStartedAt || null,
        planExpiresAt: user.planExpiresAt || null,
        trialUsed: !!user.trialUsed
      }
    });
  } catch (err) {
    console.error('Subscription history error:', err);
    res.status(500).json({ error: 'Failed to load subscription history' });
  }
});

// ─────────────────────────────────────────────
// Webhook handler (exported separately — mounted
// BEFORE express.json() in index.js)
// ─────────────────────────────────────────────
async function stripeWebhookHandler(req, res) {
  const stripe = getStripe();
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Stripe webhook is not configured right now.' });
  }

  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        if (!userId) {
          console.warn('Webhook: checkout.session.completed without userId metadata');
          break;
        }

        const user = await findOne('users.json', u => u.id === userId);
        if (!user) {
          console.warn(`Webhook: user not found: ${userId}`);
          break;
        }

        const subscriptionId = session.subscription;

        // Idempotency check
        if (user.stripeSubscriptionId === subscriptionId) {
          console.log(`Webhook: already processed subscription ${subscriptionId} for user ${userId}`);
          break;
        }

        // Retrieve subscription to check trial status
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const isTrial = subscription.trial_end && subscription.trial_end > Math.floor(Date.now() / 1000);
        const duration = session.metadata?.duration || '1m';
        const now = new Date();
        const expiresAt = isTrial
          ? new Date(subscription.trial_end * 1000).toISOString()
          : new Date(now.getTime() + DURATION_DAYS[duration] * 86400000).toISOString();

        const updates = {
          plan: 'premium',
          planDuration: duration,
          planStartedAt: now.toISOString(),
          planExpiresAt: expiresAt,
          planSource: isTrial ? 'trial' : 'stripe',
          stripeCustomerId: session.customer,
          stripeSubscriptionId: subscriptionId,
          planPaymentFailed: false,
          planPaymentAttempts: 0
        };

        if (isTrial) {
          updates.trialUsed = true;
          updates.trialEndingAt = new Date(subscription.trial_end * 1000).toISOString();
        }

        await updateOne('users.json', u => u.id === userId, updates);

        logAction('stripe_subscription_created', {
          duration,
          source: updates.planSource,
          subscriptionId
        }, userId);

        try { require('../telegram').notifyStripeSubscription(user, { duration, isTrial, expiresAt: updates.planExpiresAt }); } catch {}

        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;

        // Skip initial payment — already handled by checkout.session.completed
        if (invoice.billing_reason === 'subscription_create') {
          break;
        }

        // Handle renewals
        if (invoice.billing_reason === 'subscription_cycle') {
          const subscriptionId = invoice.subscription;
          const user = await findOne('users.json', u => u.stripeSubscriptionId === subscriptionId);
          if (!user) {
            console.warn(`Webhook: invoice.paid — no user found for subscription ${subscriptionId}`);
            break;
          }

          // Guard: only process renewals for users who are actually on premium.
          // Free users with stale stripeSubscriptionId (e.g. from a long-cancelled
          // trial) were getting bogus "Subscription Renewed" notifications.
          if (user.plan !== 'premium') {
            console.warn(`Webhook: invoice.paid for non-premium user ${user.id} (sub ${subscriptionId}); clearing stale subscription link`);
            await updateOne('users.json', u => u.id === user.id, { stripeSubscriptionId: null });
            break;
          }

          // Confirm the subscription is still active in Stripe before treating
          // this as a paid renewal (defends against replayed/late webhooks).
          let stripeStatus = null;
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            stripeStatus = sub.status;
          } catch (err) {
            console.warn(`Webhook: could not retrieve subscription ${subscriptionId}:`, err.message);
            break;
          }
          if (stripeStatus !== 'active' && stripeStatus !== 'trialing') {
            console.warn(`Webhook: invoice.paid but subscription ${subscriptionId} status is ${stripeStatus}; skipping renewal`);
            break;
          }

          const duration = user.planDuration || '1m';
          const now = new Date();
          const currentExpiry = user.planExpiresAt ? new Date(user.planExpiresAt) : now;
          const base = currentExpiry > now ? currentExpiry : now;
          const newExpiresAt = new Date(base.getTime() + DURATION_DAYS[duration] * 86400000).toISOString();

          await updateOne('users.json', u => u.id === user.id, {
            planExpiresAt: newExpiresAt,
            planPaymentFailed: false,
            planPaymentAttempts: 0,
            planSource: 'stripe',
            trialEndingSoon: false,
            trialEndingAt: null
          });

          logAction('stripe_subscription_renewed', {
            duration,
            subscriptionId
          }, user.id);

          try { require('../telegram').notifyStripeRenewal(user, { duration, expiresAt: newExpiresAt }); } catch {}
        }

        break;
      }

      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object;
        const user = await findOne('users.json', u => u.stripeSubscriptionId === subscription.id);
        if (user) {
          await updateOne('users.json', u => u.id === user.id, {
            trialEndingSoon: true,
            trialEndingAt: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null
          });
          logAction('stripe_trial_will_end', { subscriptionId: subscription.id }, user.id);
          try { require('../telegram').notifyStripeTrialEnding && require('../telegram').notifyStripeTrialEnding(user); } catch {}
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        const user = await findOne('users.json', u => u.stripeSubscriptionId === subscriptionId);

        if (user) {
          const attempts = (user.planPaymentAttempts || 0) + 1;
          await updateOne('users.json', u => u.id === user.id, {
            planPaymentFailed: true,
            planPaymentAttempts: attempts
          });

          logAction('stripe_payment_failed', {
            subscriptionId,
            attemptCount: invoice.attempt_count,
            ourAttempts: attempts
          }, user.id);

          try { require('../telegram').notifyStripeFailed(user); } catch {}

          // After 2nd failure, cancel subscription → user goes free
          if (attempts >= 2) {
            try {
              await stripe.subscriptions.cancel(subscriptionId);
              logAction('stripe_subscription_auto_cancelled', { subscriptionId, reason: 'payment_failed_twice' }, user.id);
            } catch (err) {
              console.error('Auto-cancel failed:', err);
            }
          }
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const subscriptionId = subscription.id;
        const user = await findOne('users.json', u => u.stripeSubscriptionId === subscriptionId);

        if (user) {
          await updateOne('users.json', u => u.id === user.id, {
            plan: 'free',
            planSource: null,
            stripeSubscriptionId: null,
            planPaymentFailed: false,
            planExpired: true,
            planExpiredAt: new Date().toISOString()
          });

          logAction('stripe_subscription_cancelled', {
            subscriptionId
          }, user.id);

          try { require('../telegram').notifyStripeCancelled(user); } catch {}
        }

        break;
      }

      default:
        // Unhandled event type — log but don't error
        console.log(`Unhandled Stripe event: ${event.type}`);
    }
  } catch (err) {
    // Log internal errors but return 200 to Stripe to prevent infinite retries
    console.error(`Webhook handler error for ${event.type}:`, err);
  }

  // Always return 200 to Stripe (except for signature failures handled above)
  res.json({ received: true });
}

// One-time reconciliation: find users marked free that Stripe still considers
// active/trialing (silent downgrade victims of webhook misses + the new sweep)
// and restore them with the correct planExpiresAt from Stripe.
async function reconcileStripeSubscriptions() {
  const stripe = getStripe();
  if (!stripe) {
    console.log('[stripe-reconcile] Stripe not configured, skipping');
    return;
  }
  try {
    const candidates = await findMany('users.json', u =>
      u.plan !== 'premium' && u.stripeCustomerId
    );
    if (candidates.length === 0) {
      console.log('[stripe-reconcile] no candidates');
      return;
    }
    const restored = [];
    for (const user of candidates) {
      try {
        const subs = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'all',
          limit: 10
        });
        const activeSub = subs.data.find(s => s.status === 'active' || s.status === 'trialing');
        if (!activeSub) continue;
        const item = activeSub.items?.data?.[0];
        const periodEnd = item?.current_period_end || activeSub.current_period_end;
        if (!periodEnd) continue;
        const newExpiry = new Date(periodEnd * 1000).toISOString();
        const isTrial = activeSub.status === 'trialing';
        const updates = {
          plan: 'premium',
          planSource: isTrial ? 'trial' : 'stripe',
          stripeSubscriptionId: activeSub.id,
          planExpiresAt: newExpiry,
          planExpired: false,
          planExpiredAt: null,
          planPaymentFailed: false,
          planPaymentAttempts: 0
        };
        if (isTrial) updates.trialUsed = true;
        await updateOne('users.json', u => u.id === user.id, updates);
        logAction('stripe_reconciled', {
          subscriptionId: activeSub.id,
          status: activeSub.status,
          newExpiry
        }, user.id);
        restored.push({ email: user.email, status: activeSub.status, expiry: newExpiry });

        // Catch-up Telegram notification — admin would have gotten this when
        // the original renewal webhook fired, if it had been received correctly.
        try {
          const tg = require('../telegram');
          const refreshedUser = { ...user, ...updates };
          if (isTrial) {
            tg.notifyStripeSubscription(refreshedUser, {
              duration: refreshedUser.planDuration || '1m',
              isTrial: true,
              expiresAt: newExpiry
            });
          } else {
            tg.notifyStripeRenewal(refreshedUser, {
              duration: refreshedUser.planDuration || '1m',
              expiresAt: newExpiry
            });
          }
        } catch {}
      } catch (err) {
        console.warn(`[stripe-reconcile] failed for user ${user.id}:`, err.message);
      }
    }
    if (restored.length > 0) {
      console.log(`[stripe-reconcile] restored ${restored.length} user(s):`, restored.map(r => r.email).join(', '));
      try { require('../telegram').notifyStripeReconciled(restored); } catch {}
    } else {
      console.log('[stripe-reconcile] scanned ' + candidates.length + ' candidates, none needed restoration');
    }
  } catch (err) {
    console.error('[stripe-reconcile] failed:', err.message || err);
  }
}

module.exports = { router, stripeWebhookHandler, reconcileStripeSubscriptions };
