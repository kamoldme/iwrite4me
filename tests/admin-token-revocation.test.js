const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'local-test-secret';
process.env.ADMIN_TOKEN_VALID_AFTER = '1700000000';
const { verifyToken } = require('../server/middleware/auth');
function token(role, iat) { return jwt.sign({id:'test',role,iat},process.env.JWT_SECRET,{noTimestamp:false,expiresIn:'50000d'}); }
test('administrator tokens from before rotation are rejected while writer tokens remain valid', () => {
  assert.throws(() => verifyToken(token('admin',1699999999)), /revoked/);
  assert.throws(() => verifyToken(token('admin',1700000000)), /revoked/);
  assert.equal(verifyToken(token('admin',1700000001)).role,'admin');
  assert.equal(verifyToken(token('user',1699999999)).role,'user');
});
