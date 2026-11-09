const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('guest previews enforce a weekly IP limit and claim exactly once without using account quota', { skip: process.env.RUN_GUEST_DB_TESTS !== '1' }, async () => {
  assert.equal(process.env.STAGING_MODE, '1');
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const { pool, initDB } = require('../server/utils/storage');
  await initDB();
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/guest', require('../server/routes/guest-trial'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/guest`;
  const user = crypto.randomUUID();
  const other = crypto.randomUUID();
  const ip = `198.18.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  const request = async (path, body, id, forwarded = ip, cfAddress) => {
    const headers = { 'content-type': 'application/json', 'x-forwarded-for': forwarded };
    if (cfAddress) headers['cf-connecting-ip'] = cfAddress;
    if (id) headers.authorization = `Bearer ${jwt.sign({ id, role: 'user' }, process.env.JWT_SECRET)}`;
    const response = await fetch(url + path, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  let documentId;
  try {
    for (const id of [user, other]) await pool.query('INSERT INTO users (id, data) VALUES ($1, $2)', [id, JSON.stringify({ id, plan: 'free' })]);
    const starts = await Promise.all([request('/start', {}), request('/start', {})]);
    assert.deepEqual(starts.map(r => r.status).sort(), [201, 429]);
    const token = starts.find(r => r.status === 201).data.token;
    const first = await request('/claim', { token, title: 'Test', content: '<p>My draft</p><script>alert(1)</script>' }, user);
    assert.equal(first.status, 201);
    documentId = first.data.id;
    const again = await request('/claim', { token, content: '<p>Other text</p>' }, user);
    assert.equal(again.status, 200);
    assert.equal(again.data.id, documentId);
    assert.equal((await request('/claim', { token, content: 'other' }, other)).status, 409);
    const doc = (await pool.query('SELECT data FROM documents WHERE id = $1', [documentId])).rows[0].data;
    assert.match(doc.content, /My draft/);
    assert.doesNotMatch(doc.content, /<script/i);
    assert.equal(doc.quotaExempt, true);
    const account = (await pool.query('SELECT data FROM users WHERE id = $1', [user])).rows[0].data;
    assert.equal(account.totalWords, 2);
    assert.equal(account.totalSessions, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM session_daily_usage WHERE user_id = $1', [user])).rows[0].n, 0);
    // Different visitors behind the same Cloudflare edge must not share a limit.
    const suffix = crypto.randomInt(1, 65534);
    const cfAddress1 = `198.19.${suffix >> 8}.${suffix & 255}`;
    const cfAddress2 = `198.20.${suffix >> 8}.${suffix & 255}`;
    const cf1 = await request('/start', {}, null, '104.16.0.1', cfAddress1);
    const cf2 = await request('/start', {}, null, '104.16.0.1', cfAddress2);
    assert.equal(cf1.status, 201);
    assert.equal(cf2.status, 201);
    assert.equal((await request('/start', {}, null, '104.16.0.1', cfAddress1)).status, 429);
    assert.equal((await request('/start', {}, null, '104.16.0.1')).status, 503);
    const networkKey = crypto.createHmac('sha256', process.env.GUEST_TRIAL_IP_SECRET || process.env.JWT_SECRET).update(ip).digest('hex');
    await pool.query("UPDATE guest_trial_limits SET started_at = NOW() - INTERVAL '7 days 1 minute' WHERE ip_hash = $1", [networkKey]);
    assert.equal((await request('/start', {})).status, 201);
  } finally {
    if (documentId) await pool.query('DELETE FROM documents WHERE id = $1', [documentId]);
    await pool.query('DELETE FROM guest_trial_claims WHERE claimed_by = $1', [user]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[user, other]]);
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});
