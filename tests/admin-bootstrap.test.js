const test = require('node:test');
const assert = require('node:assert/strict');
const { adminBootstrapAction } = require('../server/utils/admin-bootstrap');

test('startup never creates or changes an admin password when no password is configured', () => {
  for (const exists of [true, false]) {
    for (const staging of [true, false]) {
      assert.equal(adminBootstrapAction({ exists, staging, password: '' }), 'preserve');
      assert.equal(adminBootstrapAction({ exists, staging }), 'preserve');
    }
  }
});

test('explicit password seeds a missing admin and syncs only outside staging', () => {
  assert.equal(adminBootstrapAction({ exists: false, password: 'configured', staging: false }), 'seed');
  assert.equal(adminBootstrapAction({ exists: true, password: 'configured', staging: false }), 'sync');
  assert.equal(adminBootstrapAction({ exists: true, password: 'configured', staging: true }), 'preserve');
});
