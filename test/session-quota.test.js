const assert = require('node:assert/strict');
const test = require('node:test');
const { v4: uuid } = require('uuid');
const {
  quotaDay, resetAt, effectivePlan, quotaPayload, createSessionDocument, getSessionQuota
} = require('../server/services/sessionQuota');

test('quota uses UTC calendar days and shows the next reset', () => {
  const before = new Date('2026-09-30T23:59:59.000Z');
  const after = new Date('2026-10-01T00:00:00.000Z');
  assert.equal(quotaDay(before), '2026-09-30');
  assert.equal(resetAt(before), '2026-10-01T00:00:00.000Z');
  assert.equal(quotaDay(after), '2026-10-01');
});

test('Pro has unlimited starts until expiry, then Free has three', () => {
  const now = new Date('2026-09-30T12:00:00.000Z');
  assert.equal(effectivePlan({ plan: 'premium', planExpiresAt: '2026-10-01T00:00:00Z' }, now), 'premium');
  assert.equal(effectivePlan({ plan: 'premium', planExpiresAt: '2026-09-30T11:00:00Z' }, now), 'free');
  assert.deepEqual(quotaPayload({ plan: 'premium' }, 400, now).remaining, null);
  assert.deepEqual(quotaPayload({ plan: 'free' }, 3, now).remaining, 0);
});

test('a Free account cannot exceed three starts across concurrent requests', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const { pool } = require('../server/utils/storage');
  const userId = uuid();
  const day = quotaDay();
  await pool.query('INSERT INTO users (id, data) VALUES ($1, $2)', [userId, JSON.stringify({ id: userId, plan: 'free' })]);
  try {
    const create = (requestId = uuid()) => createSessionDocument(userId, async (_client, now) => ({
      id: uuid(), userId, title: 'Test', content: '', createdAt: now.toISOString(), updatedAt: now.toISOString(), deleted: false
    }), requestId, false);
    const attempts = await Promise.all([create(), create(), create(), create(), create()]);
    assert.equal(attempts.filter(result => result.document).length, 3);
    assert.equal(attempts.filter(result => result.limited).length, 2);
    assert.equal((await getSessionQuota(userId)).used, 3);
    await pool.query('DELETE FROM documents WHERE id = $1', [attempts[0].document.id]);
    assert.equal((await getSessionQuota(userId)).remaining, 0, 'deleting an empty session does not refund a start');
    const exempt = await createSessionDocument(userId, async (_client, now) => ({
      id: uuid(), userId, title: 'Maintenance', content: '', createdAt: now.toISOString(), deleted: false
    }), uuid(), true);
    assert.ok(exempt.document);
    assert.equal((await getSessionQuota(userId)).used, 3, 'maintenance starts are exempt');

    const retryId = uuid();
    const premiumId = uuid();
    await pool.query('UPDATE users SET data = jsonb_set(data, \'{plan}\', \'"premium"\') WHERE id = $1', [userId]);
    const first = await create(retryId);
    const retry = await create(retryId);
    assert.equal(first.document.id, retry.document.id);
    const pro = await create(premiumId);
    assert.ok(pro.document);
    assert.equal((await getSessionQuota(userId)).limit, null);
    await pool.query('UPDATE users SET data = jsonb_set(data, \'{planExpiresAt}\', to_jsonb($2::text)) WHERE id = $1', [userId, '2020-01-01T00:00:00.000Z']);
    assert.equal((await getSessionQuota(userId)).remaining, 0, 'expired Pro falls back to Free allowance');
  } finally {
    await pool.query('DELETE FROM documents WHERE data->>\'userId\' = $1', [userId]);
    await pool.query('DELETE FROM session_daily_usage WHERE user_id = $1 AND day = $2', [userId, day]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  }
});
