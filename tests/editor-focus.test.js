const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture() {
  const tasks = [];
  const document = { hidden: false, hasFocus: () => true };
  const sandbox = { document, setTimeout: fn => tasks.push(fn) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/editor.js'), 'utf8') + '\nglobalThis.editor = Editor;', sandbox);
  const editor = sandbox.editor;
  editor.active = true;
  let leaves = 0, returns = 0;
  editor.onTabLeave = () => leaves++;
  editor.onTabReturn = () => returns++;
  return { editor, document, flush: () => tasks.splice(0).forEach(fn => fn()), counts: () => ({ leaves, returns }) };
}

test('iframe focus does not start a leave countdown or steal focus back', () => {
  const f = fixture();
  f.editor.onWindowBlur();
  f.flush();
  f.editor.onWindowFocus();
  assert.deepEqual(f.counts(), { leaves: 0, returns: 0 });
});

test('leaving the window still starts a countdown and returning clears it', () => {
  const f = fixture();
  f.document.hasFocus = () => false;
  f.editor.onWindowBlur();
  f.flush();
  assert.equal(f.counts().leaves, 1);
  f.editor.tabCountdown = 1;
  f.editor.onWindowFocus();
  assert.equal(f.counts().returns, 1);
});

test('a hidden tab still starts the countdown', () => {
  const f = fixture();
  f.document.hidden = true;
  f.editor.onWindowBlur();
  f.flush();
  assert.equal(f.counts().leaves, 1);
});

test('the countdown alarm starts once and stops its oscillators on return', () => {
  const f = fixture();
  const oscillators = [];
  const parameter = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
  f.editor._tabAlarmContext = {
    state: 'running', currentTime: 1, destination: {},
    createOscillator() {
      const oscillator = { frequency: parameter(), connect() {}, start() { this.started = true; }, stop() { this.stopped = true; } };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain() { return { gain: parameter(), connect() {} }; }
  };
  f.editor._startTabAlarm();
  f.editor._startTabAlarm();
  assert.equal(oscillators.length, 2);
  assert.ok(oscillators.every(node => node.started));
  f.editor._stopTabAlarm();
  assert.ok(oscillators.every(node => node.stopped));
  assert.equal(f.editor._tabAlarmNodes, null);
});
