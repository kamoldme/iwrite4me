const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

// Uses a disposable schema; never runs against the application's configured DB.
test('session feedback integration', { skip: !process.env.FEEDBACK_TEST_DATABASE_URL }, async t => {
  const { Pool } = require('pg');
  const connectionString = process.env.FEEDBACK_TEST_DATABASE_URL;
  const schema = 'feedback_test_' + randomUUID().replaceAll('-', '');
  const setup = new Pool({ connectionString });
  await setup.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(connectionString);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { pool, initDB } = require('../server/utils/storage');
  const { recordFeedback, DAY } = require('../server/utils/feedback');
  await initDB();
  const now = Date.now();
  async function fixture(overrides = {}, userId = randomUUID()) {
    const doc = { id: randomUUID(), userId, completed: true, completedAt: new Date(now - 1000).toISOString(), wordCount: 100, duration: 60, mode: 'standard', ...overrides };
    await pool.query('INSERT INTO documents VALUES ($1,$2)', [doc.id, doc]);
    return doc;
  }
  try {
    await t.test('only a recent, saved, owned and nonempty session qualifies', async () => {
      for (const overrides of [{ completed: false }, { deleted: true }, { deactivatedByAdmin: true }, { wordCount: 0 }, { completedAt: new Date(now - 2 * DAY).toISOString() }, { completedAt: null }]) {
        const doc = await fixture(overrides);
        await assert.rejects(recordFeedback(doc.userId, doc.id, null, now), { status: 409 });
      }
      const doc = await fixture();
      await assert.rejects(recordFeedback(randomUUID(), doc.id, null, now), { status: 404 });
      await assert.rejects(recordFeedback(doc.userId, 'invalid', null, now), { status: 400 });
    });
    await t.test('concurrent invitations produce one prompt; skipping pauses seven days', async () => {
      const doc = await fixture();
      const replies = await Promise.all([recordFeedback(doc.userId, doc.id, null, now), recordFeedback(doc.userId, doc.id, null, now)]);
      assert.equal(replies.filter(r => r.eligible).length, 1);
      assert.equal(Date.parse(replies[0].nextPromptAt), now + 7 * DAY);
      const next = await fixture({ completedAt: new Date(now + 7 * DAY - 1).toISOString() }, doc.userId);
      assert.equal((await recordFeedback(doc.userId, next.id, null, now + 7 * DAY - 1)).eligible, false);
      assert.equal((await recordFeedback(doc.userId, next.id, null, now + 7 * DAY)).eligible, true);
    });
    await t.test('validation, optional comment, duplicate retry and 30-day boundary', async () => {
      const doc = await fixture();
      await assert.rejects(recordFeedback(doc.userId, doc.id, { rating: 5 }, now), { status: 409 });
      await recordFeedback(doc.userId, doc.id, null, now);
      for (const rating of [0, 6, 1.5, '5', null]) await assert.rejects(recordFeedback(doc.userId, doc.id, { rating }, now), { status: 400 });
      for (const comment of ['x'.repeat(1001), {}, 42]) await assert.rejects(recordFeedback(doc.userId, doc.id, { rating: 4, comment }, now), { status: 400 });
      const responses = await Promise.all([recordFeedback(doc.userId, doc.id, { rating: 4 }, now), recordFeedback(doc.userId, doc.id, { rating: 4 }, now)]);
      assert.equal(responses.filter(r => r.feedback).length, 1);
      assert.equal(responses.find(r => r.feedback).feedback.comment, '');
      assert.equal(Date.parse(responses[0].nextPromptAt), now + 30 * DAY);
      assert.equal((await pool.query('SELECT * FROM session_feedback WHERE id=$1', [doc.id])).rowCount, 1);
      const next = await fixture({ completedAt: new Date(now + 30 * DAY - 1).toISOString() }, doc.userId);
      assert.equal((await recordFeedback(doc.userId, next.id, null, now + 30 * DAY - 1)).eligible, false);
      assert.equal((await recordFeedback(doc.userId, next.id, null, now + 30 * DAY)).eligible, true);
    });
    await t.test('HTTP auth, admin summary, full comment and one notification on retries', async () => {
      const express = require('express');
      const { generateToken } = require('../server/middleware/auth');
      const telegram = require('../server/telegram');
      const notifications = [];
      telegram.notifySessionFeedback = (user, feedback) => notifications.push(feedback);
      const app = express(); app.use(express.json());
      app.use('/feedback', require('../server/routes/feedback'));
      app.use('/admin', require('../server/routes/admin'));
      app.use((err, req, res, next) => res.status(500).json({ error: 'test failure' }));
      const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
      const base = `http://127.0.0.1:${server.address().port}`;
      const doc = await fixture();
      const token = generateToken({ id: doc.userId, role: 'user' });
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      try {
        assert.equal((await fetch(base + '/admin/feedback')).status, 401);
        assert.equal((await fetch(base + '/admin/feedback', { headers })).status, 403);
        assert.equal((await fetch(base + `/feedback/${doc.id}/prompt`, { method: 'POST', headers })).status, 200);
        const comment = '<script>alert("x")</script> & a thoughtful comment';
        for (const expected of [201, 200]) {
          const response = await fetch(base + `/feedback/${doc.id}`, { method: 'POST', headers, body: JSON.stringify({ rating: 5, comment }) });
          assert.equal(response.status, expected);
        }
        assert.equal(notifications.length, 1); assert.equal(notifications[0].comment, comment);
        const adminHeaders = { Authorization: `Bearer ${generateToken({ id: randomUUID(), role: 'admin' })}` };
        const summary = await (await fetch(base + '/admin/feedback?rating=5', { headers: adminHeaders })).json();
        assert.equal(summary.total, 2); assert.equal(summary.average, 4.5); assert.equal(summary.positivePercent, 100);
        assert.equal(summary.items.length, 1); assert.equal(summary.items[0].comment, comment);
      } finally { await new Promise(resolve => server.close(resolve)); }
    });
  } finally {
    await pool.end(); await setup.query(`DROP SCHEMA ${schema} CASCADE`); await setup.end();
  }
});
