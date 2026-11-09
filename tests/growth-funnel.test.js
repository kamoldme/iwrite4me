const test = require('node:test');
const assert = require('node:assert/strict');
const { growthFunnel } = require('../server/services/growthFunnel');
test('cohorts count people once, exclude trials, include guest drafts and limit to seven days', () => {
  const now = Date.parse('2026-11-20T00:00:00Z');
  const report = growthFunnel({
    users: [{id:'a',createdAt:'2026-11-09T12:00:00Z'}, {id:'b',createdAt:'2026-11-09T12:00:00Z'}, {id:'admin',createdAt:'2026-11-09T12:00:00Z',isAdmin:true}],
    documents: [{userId:'a',createdAt:'2026-11-09T11:30:00Z',completedAt:'2026-11-09T12:01:00Z',completed:true,guestTrial:true}, {userId:'a',createdAt:'2026-11-10T12:00:00Z',completed:false}, {userId:'b',createdAt:'2026-11-18T12:00:00Z',completed:true,completedAt:'2026-11-18T12:30:00Z'}],
    logs: [{userId:'a',timestamp:'2026-11-10T00:00:00Z',action:'stripe_checkout_created'}, {userId:'a',timestamp:'2026-11-10T00:00:00Z',action:'stripe_subscription_created',source:'trial'}, {userId:'b',timestamp:'2026-11-10T00:00:00Z',action:'stripe_subscription_created',source:'stripe'}],
    payments: [{userId:'b',state:'paid',paidAt:'2026-11-10T00:00:00Z'}],
    guests: [{startedAt:'2026-11-19T00:00:00Z',claimed:true},{startedAt:'2026-11-19T00:00:00Z',claimed:false}]
  }, now);
  assert.deepEqual(report.cohorts[0], {week:'2026-11-09',signups:2,started:1,completed:1,returned:1,checkout:1,paid:1,mature:2});
  assert.deepEqual(report.guestLast7Days, {started:2,saved:1});
});

test('funnel endpoint requires an admin and returns only aggregates', {skip:process.env.RUN_STAGING_DB_TESTS !== '1'}, async () => {
  assert.equal(process.env.STAGING_MODE, '1');
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const { pool, initDB } = require('../server/utils/storage');
  assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, 'iwrite_staging');
  await initDB();
  const app = express(); app.use('/admin', require('../server/routes/admin'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/admin/growth-funnel`;
  try {
    assert.equal((await fetch(url)).status, 401);
    const token = role => jwt.sign({id:'test',role}, process.env.JWT_SECRET);
    assert.equal((await fetch(url,{headers:{authorization:`Bearer ${token('user')}`}})).status, 403);
    const res = await fetch(url,{headers:{authorization:`Bearer ${token('admin')}`}});
    assert.equal(res.status, 200); assert.match(res.headers.get('cache-control'), /no-store/);
    const body = await res.json();
    assert.ok(Array.isArray(body.cohorts));
    assert.deepEqual(Object.keys(body.guestLast7Days).sort(), ['saved','started']);
    assert.ok(body.cohorts.every(c => Object.keys(c).every(k => ['week','signups','started','completed','returned','checkout','paid','mature'].includes(k))));
  } finally { await new Promise(resolve => server.close(resolve)); await pool.end(); }
});
