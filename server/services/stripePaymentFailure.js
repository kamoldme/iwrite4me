const { pool } = require('../utils/storage');

async function applyStripePaymentFailure(eventId, invoice, subscriptionId) {
  if (!eventId || !subscriptionId || !invoice?.id) throw new Error('Payment failure requires event, invoice and subscription IDs');
  // Distinct event objects can describe the same invoice attempt.
  const attempt = Number(invoice.attempt_count);
  const eventKey = Number.isInteger(attempt) && attempt > 0 ? `${invoice.id}:${attempt}` : `event:${eventId}`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query("SELECT id, data FROM users WHERE data->>'stripeSubscriptionId' = $1 FOR UPDATE", [subscriptionId]);
    if (result.rows.length > 1) throw new Error('Subscription is linked to multiple users');
    const user = result.rows[0]?.data;
    if (!user) { await client.query('COMMIT'); return { status: 'skipped' }; }
    const claimed = await client.query('INSERT INTO stripe_failure_events (event_key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_key', [eventKey]);
    const attempts = Math.max(0, Number(user.planPaymentAttempts) || 0) + (claimed.rowCount ? 1 : 0);
    if (claimed.rowCount) {
      await client.query('UPDATE users SET data = data || $2::jsonb WHERE id=$1', [result.rows[0].id, JSON.stringify({planPaymentFailed:true,planPaymentAttempts:attempts})]);
    }
    await client.query('COMMIT');
    return { status: claimed.rowCount ? 'applied' : 'duplicate', attempts };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
module.exports = { applyStripePaymentFailure };
