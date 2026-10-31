const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('friend avatars and presence stay scoped to friends without leaking account secrets', { skip: process.env.RUN_STAGING_DB_TESTS !== '1' }, async () => {
  assert.equal(process.env.STAGING_MODE, '1');
  const { pool } = require('../server/utils/storage');
  assert.equal((await pool.query('select current_database() as name')).rows[0].name, 'iwrite_staging');
  const express = require('express'), jwt = require('jsonwebtoken'), app = express();
  const viewer = crypto.randomUUID(), online = crypto.randomUUID(), stale = crypto.randomUUID(), stranger = crypto.randomUUID(), suggestion = crypto.randomUUID();
  const ids = [viewer, online, stale, stranger, suggestion];
  const active = new Map([[online, { lastSeen: Date.now() }], [stale, { lastSeen: Date.now() - 6 * 60 * 1000 }], [stranger, { lastSeen: Date.now() }]]);
  app.set('activeUsers', active); app.use('/friends', require('../server/routes/friends'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const token = jwt.sign({ id: viewer, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '1m' });
  async function get(path) { const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers: { Authorization: `Bearer ${token}` } }); assert.equal(r.status, 200); return r.json(); }
  try {
    const users = [
      {id:viewer,email:`${viewer}@example.invalid`,friends:[online,stale],friendRequests:[stranger]},
      {id:online,email:`${online}@example.invalid`,name:'Online',friends:[suggestion],avatar:'/uploads/avatars/test.jpg',avatarUpdatedAt:123,password:'private',passwordResetCodeHash:'private',stripeCustomerId:'private'},
      {id:stale,email:`${stale}@example.invalid`,name:'Offline'},
      {id:stranger,email:`${stranger}@example.invalid`,name:'Stranger',passwordResetCodeHash:'private'},
      {id:suggestion,email:`${suggestion}@example.invalid`,name:'Suggested',passwordResetCodeHash:'private'}
    ];
    for (const user of users) await pool.query('insert into users(id,data) values($1,$2)', [user.id, JSON.stringify(user)]);
    const list = await get('/friends');
    const shownOnline = list.friends.find(f => f.id === online), shownOffline = list.friends.find(f => f.id === stale);
    assert.equal(shownOnline.isOnline, true); assert.equal(shownOnline.avatar, '/uploads/avatars/test.jpg');
    assert.equal(shownOffline.isOnline, false); assert.equal(shownOnline.password, undefined); assert.equal(shownOnline.passwordResetCodeHash, undefined); assert.equal(shownOnline.stripeCustomerId, undefined);
    const requests = await get('/friends/requests'); assert.equal(requests[0].id, stranger); assert.equal(requests[0].passwordResetCodeHash, undefined);
    const suggestions = await get('/friends/suggestions'); assert.equal(suggestions[0].id, suggestion); assert.equal(suggestions[0].mutualCount, 1); assert.equal(suggestions[0].passwordResetCodeHash, undefined);
    const first = (await get('/friends/presence')).presence;
    assert.equal(first[online], true); assert.equal(first[stale], false); assert.equal(first[stranger], undefined);
    active.delete(online); active.set(stale, {lastSeen: Date.now()});
    const second = (await get('/friends/presence')).presence;
    assert.equal(second[online], false); assert.equal(second[stale], true);
    app.set('activeUsers', undefined);
    assert.equal((await get('/friends/presence')).presence[stale], false);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await pool.query('delete from users where id=any($1::uuid[])', [ids]);
    await pool.end();
  }
});
