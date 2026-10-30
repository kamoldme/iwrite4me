const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('Google sign-in cannot take over a different or non-authoritative email account', { skip: process.env.RUN_STAGING_DB_TESTS !== '1' }, async () => {
  assert.equal(process.env.STAGING_MODE, '1');
  const { pool } = require('../server/utils/storage');
  assert.equal((await pool.query('select current_database() as name')).rows[0].name, 'iwrite_staging');
  const { OAuth2Client } = require('google-auth-library');
  const bcrypt = require('bcryptjs');
  process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
  const original = OAuth2Client.prototype.verifyIdToken;
  let payload;
  OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => payload });
  const express = require('express');
  const app = express(); app.use(express.json()); app.use('/auth', require('../server/routes/auth'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const id = crypto.randomUUID(), email = `gtest-${id}@gmail.com`;
  const otherId = crypto.randomUUID(), otherEmail = `gtest-${otherId}@example.invalid`;
  async function signIn(claims) {
    payload = claims;
    const response = await fetch(base + '/auth/google', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential: 'test' }) });
    return response.status;
  }
  try {
    const password = await bcrypt.hash('original-safe-password', 4);
    const resetHash = crypto.createHash('sha256').update('123456').digest('hex');
    await pool.query('insert into users(id,data) values($1,$2),($3,$4)', [id, JSON.stringify({ id, email, password, googleId:'original-google-id', provider:'google', role:'user', acceptedTermsAt:'2026-01-01T00:00:00Z', passwordResetCodeHash:resetHash, passwordResetExpiresAt:new Date(Date.now()+60000).toISOString() }), otherId, JSON.stringify({ id:otherId, email:otherEmail, role:'user', acceptedTermsAt:'2026-01-01T00:00:00Z' })]);
    assert.equal(await signIn({ sub:'different-google-id', email, email_verified:true }), 409);
    assert.equal(await signIn({ sub:'original-google-id', email, email_verified:false }), 401);
    assert.equal(await signIn({ sub:'new-google-id', email:otherEmail, email_verified:true }), 409);
    assert.equal(await signIn({ sub:'original-google-id', email, email_verified:true }), 200);
    const reset = await fetch(base + '/auth/reset-password', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email,code:'123456',newPassword:'replacement-safe-password',confirmPassword:'replacement-safe-password'})});
    assert.equal(reset.status, 200);
    assert.equal((await reset.json()).user.hasPassword, true);
    const rows = await pool.query('select data from users where id=any($1::uuid[])', [[id, otherId]]);
    assert.equal(rows.rows.find(x => x.data.id === id).data.googleId, 'original-google-id');
    assert.equal(rows.rows.find(x => x.data.id === otherId).data.googleId, undefined);
  } finally {
    OAuth2Client.prototype.verifyIdToken = original;
    await new Promise(resolve => server.close(resolve));
    await pool.query('delete from users where id=any($1::uuid[])', [[id, otherId]]);
    await pool.end();
  }
});
