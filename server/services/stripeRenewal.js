const { pool } = require('../utils/storage');
const DAYS = { '1m': 30, '3m': 90, '6m': 180 };

async function applyStripeRenewal(invoiceId, subscriptionId, now = new Date()) {
  if (typeof invoiceId !== 'string' || !invoiceId || typeof subscriptionId !== 'string' || !subscriptionId) {
    throw new Error('Renewal requires invoice and subscription IDs');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query("SELECT id, data FROM users WHERE data->>'stripeSubscriptionId' = $1 FOR UPDATE", [subscriptionId]);
    if (result.rows.length > 1) throw new Error('Subscription is linked to multiple users');
    const user = result.rows[0]?.data;
    if (!user || user.plan !== 'premium') {
      await client.query('COMMIT');
      return { status: 'skipped' };
    }
    const duration = user.planDuration || '1m';
    if (!DAYS[duration]) throw new Error('Unknown subscription duration');
    const claimed = await client.query('INSERT INTO stripe_renewal_invoices (invoice_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING invoice_id', [invoiceId]);
    if (!claimed.rowCount) {
      await client.query('COMMIT');
      return { status: 'duplicate' };
    }
    const previous = user.planExpiresAt ? new Date(user.planExpiresAt) : now;
    if (!Number.isFinite(previous.getTime())) throw new Error('Invalid subscription expiry');
    const base = previous > now ? previous : now;
    const expiresAt = new Date(base.getTime() + DAYS[duration] * 86400000).toISOString();
    const updates = { planExpiresAt: expiresAt, planPaymentFailed: false, planPaymentAttempts: 0, planSource: 'stripe', trialEndingSoon: false, trialEndingAt: null };
    await client.query('UPDATE users SET data = data || $2::jsonb WHERE id = $1', [result.rows[0].id, JSON.stringify(updates)]);
    await client.query('COMMIT');
    return { status: 'applied', user, duration, expiresAt };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
module.exports = { applyStripeRenewal };
