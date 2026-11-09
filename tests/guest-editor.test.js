const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const values = new Map();
  const localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
  const nodes = {
    'editor-title': { value: 'Test title' },
    'editor-textarea': { innerHTML: '<p>Keep my draft</p>' }
  };
  const window = { location: { href: '' } };
  const App = { toast() {} };
  const sandbox = { localStorage, window, App, clearInterval() {}, document: { getElementById: id => nodes[id] } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/editor.js'), 'utf8') + '\nglobalThis.editor = Editor;', sandbox);
  const editor = sandbox.editor;
  editor.active = true;
  editor._guestTrial = true;
  editor._tabs = [{ name: 'Draft', html: '', font: 'sans' }];
  editor._activeTabIdx = 0;
  editor._serializeTabFonts = () => ['sans'];
  localStorage.setItem('iwrite_guest_trial', JSON.stringify({ token: 'test-token', startedAt: '2026-01-01' }));
  return { editor, localStorage, window, nodes, values };
}

test('finishing a guest session saves the current draft before navigating to registration', async () => {
  const f = fixture();
  let cleaned = false;
  f.editor.cleanup = () => { cleaned = true; };
  await f.editor.completeSession(true);
  const saved = JSON.parse(f.localStorage.getItem('iwrite_guest_trial'));
  assert.equal(saved.content, '<p>Keep my draft</p>');
  assert.equal(saved.title, 'Test title');
  assert.equal(saved.readyToClaim, true);
  assert.equal(f.window.location.href, '/register?guest=save');
  assert.equal(cleaned, true);
});

test('storage failure leaves the guest editor open so the draft is not discarded', async () => {
  const f = fixture();
  let cleaned = false;
  f.editor.cleanup = () => { cleaned = true; };
  f.localStorage.setItem = () => { throw new Error('storage unavailable'); };
  await f.editor.completeSession(true);
  assert.equal(f.window.location.href, '');
  assert.equal(cleaned, false);
  assert.equal(f.nodes['editor-textarea'].innerHTML, '<p>Keep my draft</p>');
});

test('a 30-minute guest timer completes on expiry', () => {
  const f = fixture();
  f.nodes['editor-timer'] = { textContent: '', className: '' };
  f.editor.duration = 30;
  f.editor.startTime = Date.now() - 30 * 60 * 1000;
  f.editor._effectivePaused = () => 0;
  f.editor._updatePaceAndSaved = () => {};
  f.editor._applyTimerVisibility = () => {};
  f.editor._updateElapsedBar = () => {};
  let expired = false;
  f.editor.completeSession = value => { expired = value; };
  f.editor.updateTimer();
  assert.equal(f.nodes['editor-timer'].textContent, '0:00');
  assert.equal(expired, true);
});
