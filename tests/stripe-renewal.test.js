const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

// This integration test is opt-in and only runs against the isolated staging DB.
test('renewal applies once under concurrent delivery and rolls back failed claims', { skip: process.env.RUN_STAGING_DB_TESTS !== '1' }, async () => {
  assert.equal(process.env.STAGING_MODE, '1');
  const { pool } = require('../server/utils/storage');
  const { applyStripeRenewal } = require('../server/services/stripeRenewal');
  const db = await pool.query('SELECT current_database() AS name');
  assert.equal(db.rows[0].name, 'iwrite_staging');
  const id = randomUUID(), sub = `test_sub_${id}`, invoice = `test_invoice_${id}`, badInvoice = `test_retry_${id}`;
  const user = { id, email: `release-test-${id}@example.invalid`, plan: 'premium', planDuration: '1m', stripeSubscriptionId: sub, planExpiresAt: '2026-01-01T00:00:00.000Z' };
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS stripe_renewal_invoices (invoice_id TEXT PRIMARY KEY, processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    await pool.query('INSERT INTO users (id,data) VALUES ($1,$2)', [id, JSON.stringify(user)]);
    const now = new Date('2026-10-30T00:00:00.000Z');
    const result = await Promise.all(Array.from({length: 5}, () => applyStripeRenewal(invoice, sub, now)));
    assert.equal(result.filter(r => r.status === 'applied').length, 1);
    assert.equal(result.filter(r => r.status === 'duplicate').length, 4);
    let row = await pool.query('SELECT data FROM users WHERE id=$1', [id]);
    assert.equal(row.rows[0].data.planExpiresAt, '2026-11-29T00:00:00.000Z');
    await pool.query("UPDATE users SET data=jsonb_set(data,'{planExpiresAt}',to_jsonb('invalid'::text)) WHERE id=$1", [id]);
    await assert.rejects(applyStripeRenewal(badInvoice, sub, now), /Invalid subscription expiry/);
    let claim = await pool.query('SELECT 1 FROM stripe_renewal_invoices WHERE invoice_id=$1', [badInvoice]);
    assert.equal(claim.rowCount, 0);
    await pool.query("UPDATE users SET data=jsonb_set(data,'{planExpiresAt}',to_jsonb('2026-11-29T00:00:00.000Z'::text)) WHERE id=$1", [id]);
    assert.equal((await applyStripeRenewal(badInvoice, sub, now)).status, 'applied');
  } finally {
    await pool.query('DELETE FROM stripe_renewal_invoices WHERE invoice_id=ANY($1::text[])', [[invoice,badInvoice]]);
    await pool.query('DELETE FROM users WHERE id=$1', [id]);
    await pool.end();
  }
});
