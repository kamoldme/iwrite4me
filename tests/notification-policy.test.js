const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../public/js/notification-policy');
const item = (id, time) => ({ id, createdAt: new Date(time).toISOString(), read: false });
test('one-time reset excludes existing notices and keeps new ones', () => {
  const now = policy.resetAt + 10000;
  assert.deepEqual(policy.filter([item('old', policy.resetAt - 1), item('boundary', policy.resetAt), item('new', now - 1)], now).map(n => n.id), ['new']);
});
test('seven-day expiry includes fresh notices and excludes exact expiry', () => {
  const now = policy.resetAt + policy.lifetime * 2;
  assert.deepEqual(policy.filter([item('expired', now - policy.lifetime), item('fresh', now - policy.lifetime + 1)], now).map(n => n.id), ['fresh']);
});
test('unknown and future dates never become permanent notifications', () => {
  const now = policy.resetAt + 10000;
  assert.deepEqual(policy.filter([{}, { createdAt: 'invalid' }, item('future', now + 1)], now), []);
});
test('next expiry identifies the first deadline without mutating records', () => {
  const now = policy.resetAt + policy.lifetime * 2;
  const list = [item('newer', now - 100), item('older', now - 200)];
  const original = JSON.stringify(list);
  assert.equal(policy.nextExpiry(list, now), now - 200 + policy.lifetime);
  assert.equal(JSON.stringify(list), original);
  assert.equal(policy.nextExpiry([], now), null);
});
