const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(readyToClaim) {
  const initial = { token: 'guest-token', content: '<p>Draft</p>', readyToClaim };
  const storage = new Map([['iwrite_guest_trial', JSON.stringify(initial)]]);
  const localStorage = { getItem: key => storage.get(key) || null, removeItem: key => storage.delete(key) };
  const requests = [];
  const API = {
    request: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return { id: 'test-doc' }; },
    getMe: async () => ({ id: 'test-user', role: 'user' })
  };
  const sandbox = { localStorage, API, document: { addEventListener() {}, querySelector() { return null; }, createElement() { return { addEventListener() {} }; } }, console };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8') + '\nglobalThis.app = App;', sandbox);
  sandbox.app.toast = () => {};
  sandbox.app.updateUserUI = () => {};
  sandbox.app.loadDocuments = async () => {};
  sandbox.app.loadDashboard = async () => {};
  return { app: sandbox.app, storage, requests, API };
}

test('sign-in does not claim a guest draft while its session is still running', async () => {
  const f = fixture(false);
  await f.app.claimGuestTrial();
  assert.equal(f.requests.length, 0);
  assert.ok(f.storage.has('iwrite_guest_trial'));
});

test('a failed claim keeps the draft for retry', async () => {
  const f = fixture(true);
  f.API.request = async () => { throw new Error('network unavailable'); };
  await f.app.claimGuestTrial();
  assert.ok(f.storage.has('iwrite_guest_trial'));
});

test('a finished draft is claimed and removed locally only after the server confirms saving', async () => {
  const f = fixture(true);
  await f.app.claimGuestTrial();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, '/guest-trial/claim');
  assert.equal(f.requests[0].body.content, '<p>Draft</p>');
  assert.equal(f.storage.has('iwrite_guest_trial'), false);
});

test('the Google sign-in callback transfers a finished guest draft', async () => {
  const initial = { token: 'guest-token', content: '<p>Google draft</p>', readyToClaim: true };
  const storage = new Map([['iwrite_guest_trial', JSON.stringify(initial)]]);
  const localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const elements = {
    'register-form': { hidden: false }, 'register-privacy-consent': { checked: true },
    'auth-view': { style: {} }, 'app-view': { style: {} }
  };
  const document = { title: 'Test', addEventListener() {}, getElementById: id => elements[id] || null, querySelector() { return null; }, documentElement: { classList: { add() {} } } };
  const calls = [];
  const API = {
    setToken: token => calls.push(['token', token]),
    request: async (url, options) => { calls.push([url, JSON.parse(options.body)]); return { id: 'doc' }; },
    getMe: async () => ({ id: 'user', role: 'user', xp: 0 })
  };
  const sandbox = {
    document, localStorage, API, console, location: { pathname: '/register', hash: '' },
    history: { replaceState() {} }, window: { location: { pathname: '/register' }, history: { replaceState() {} } },
    fetch: async () => ({ ok: true, json: async () => ({ token: 'auth-token', user: { id: 'user', role: 'user', xp: 0 } }) }),
    Monsters: { destroy() {} }, Editor: { resumeSession: async () => false },
    setTimeout() {}, clearInterval() {}, URLSearchParams
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8') + '\nglobalThis.app = App;', sandbox);
  const app = sandbox.app;
  for (const name of ['updateUserUI', '_setupTabFocusTracking', 'bindAppEvents', 'startNotifPolling', '_applyProLocks', 'toast', 'switchView']) app[name] = () => {};
  app.loadDocuments = app.loadDashboard = async () => {};
  await app.handleGoogleCredential({ credential: 'test-google-credential' });
  // showApp starts the claim asynchronously.
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.some(call => call[0] === '/guest-trial/claim' && call[1].content === '<p>Google draft</p>'));
  assert.equal(storage.has('iwrite_guest_trial'), false);
});
