const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

test('signed renewal webhook retries transient failures and ignores duplicate invoices', { skip: process.env.RUN_STAGING_DB_TESTS !== '1' }, async () => {
  assert.equal(process.env.STAGING_MODE, '1');
  const { pool } = require('../server/utils/storage');
  assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, 'iwrite_staging');
  const RealStripe = require('stripe');
  let fail = false;
  const signingSecret = 'whsec_release_test_only';
  const verifier = new RealStripe('sk_test_release_test_only');
  function StubStripe() {
    return { webhooks: verifier.webhooks, subscriptions: { retrieve: async () => { if (fail) throw new Error('simulated Stripe outage'); return {status:'active'}; } } };
  }
  require.cache[require.resolve('stripe')].exports = StubStripe;
  process.env.STRIPE_SECRET_KEY = 'sk_test_release_test_only';
  process.env.STRIPE_WEBHOOK_SECRET = signingSecret;
  const { stripeWebhookHandler } = require('../server/routes/stripe');
  const express = require('express'), app = express();
  app.post('/webhook', express.raw({type:'application/json'}), stripeWebhookHandler);
  const server = await new Promise(resolve => { const s=app.listen(0,'127.0.0.1',()=>resolve(s)); });
  const id=randomUUID(), subscription=`test_sub_${id}`, invoice=`test_invoice_${id}`, retry=`test_retry_${id}`;
  const user={id, email:`release-test-${id}@example.invalid`,plan:'premium',planDuration:'1m',stripeSubscriptionId:subscription,planExpiresAt:'2090-01-01T00:00:00.000Z'};
  async function deliver(invoiceId, valid=true) {
    const payload=JSON.stringify({id:`evt_${invoiceId}`,type:'invoice.paid',data:{object:{id:invoiceId,subscription,billing_reason:'subscription_cycle'}}});
    const signature=verifier.webhooks.generateTestHeaderString({payload,secret:valid?signingSecret:'wrong_secret'});
    return fetch(`http://127.0.0.1:${server.address().port}/webhook`,{method:'POST',headers:{'content-type':'application/json','stripe-signature':signature},body:payload});
  }
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS stripe_renewal_invoices (invoice_id TEXT PRIMARY KEY, processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    await pool.query('INSERT INTO users (id,data) VALUES ($1,$2)',[id,JSON.stringify(user)]);
    assert.equal((await deliver(invoice,false)).status,400);
    fail=true; assert.equal((await deliver(invoice)).status,500);
    fail=false; assert.equal((await deliver(invoice)).status,200);
    assert.equal((await deliver(invoice)).status,200);
    let result=await pool.query('SELECT data FROM users WHERE id=$1',[id]);
    assert.equal(result.rows[0].data.planExpiresAt,'2090-01-31T00:00:00.000Z');
    assert.equal((await deliver(retry)).status,200);
    result=await pool.query('SELECT data FROM users WHERE id=$1',[id]);
    assert.equal(result.rows[0].data.planExpiresAt,'2090-03-02T00:00:00.000Z');
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await pool.query('DELETE FROM stripe_renewal_invoices WHERE invoice_id=ANY($1::text[])',[[invoice,retry]]);
    await pool.query("DELETE FROM logs WHERE data->>'userId'=$1",[id]);
    await pool.query('DELETE FROM users WHERE id=$1',[id]);
    await pool.end();
  }
});
