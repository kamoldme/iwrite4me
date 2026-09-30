const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadEditor() {
  const cleared = [];
  const completed = [];
  let dangerTick;
  let resolveTitle;
  const sandbox = {
    App: {
      _maintActive: false,
      user: { plan: 'free' },
      promptTitle: () => new Promise(resolve => { resolveTitle = resolve; }),
      refreshSessionQuota() {},
      async loadDocuments() {},
      checkPendingProCongrats() {}
    },
    API: { async completeSession(_id, payload) { completed.push(payload); return { user: { streak: 0 }, document: { id: 'doc' } }; } },
    SessionFeedback: { show() {} },
    clearInterval: id => cleared.push(id),
    setInterval: callback => { dangerTick = callback; return 7; },
    setTimeout: () => 1,
    document: { getElementById: () => ({ style: {} }), body: { classList: { remove() {} } } },
    localStorage: { removeItem() {} },
    Date,
  };
  const source = fs.readFileSync(process.env.IWRITE_EDITOR_SOURCE || path.join(__dirname, '../public/js/editor.js'), 'utf8');
  vm.runInNewContext(`${source}\n;globalThis.__editor = Editor;`, sandbox);
  const editor = sandbox.__editor;
  editor.active = true;
  editor.abandoned = false;
  editor.mode = 'dangerous';
  editor.duration = 3;
  editor.startTime = Date.now() - 3 * 60 * 1000;
  editor.lastKeystroke = Date.now() - 10_000;
  editor.dangerThreshold = 5_000;
  editor._effectivePaused = () => 0;
  editor.getWordCount = () => 200;
  editor._totalWordCount = () => 200;
  editor.getWordLimit = () => 1_500;
  editor._serializeTabs = () => '<p>All 200 words survive.</p>';
  editor.documentId = 'doc';
  editor._clearSessionState = () => {};
  editor.cleanup = () => { editor.active = false; editor._completing = false; };
  editor.showComplete = () => {};
  Object.defineProperty(editor, 'titleInput', { value: { value: '' } });
  Object.defineProperty(editor, 'textarea', { value: { innerHTML: '<p>All 200 words survive.</p>' } });
  Object.defineProperty(editor, 'container', { value: { classList: { remove() {} } } });
  Object.defineProperty(editor, 'vignette', {
    value: { classList: { remove() {} }, style: { opacity: 1 } }
  });
  return { editor, cleared, completed, dangerTick: () => dangerTick, resolveTitle: value => resolveTitle(value) };
}

test('dangerous inactivity cannot consume hearts after the writing timer expires', () => {
  const { editor, dangerTick } = loadEditor();
  let failures = 0;
  editor.failDangerMode = () => { failures++; };
  editor.startDangerMode();
  dangerTick()();
  assert.equal(failures, 0);
  assert.equal(editor.active, true);
});

test('the title prompt freezes dangerous mode as soon as the session ends', async () => {
  const { editor, cleared, completed, resolveTitle } = loadEditor();
  editor.timerInterval = 1;
  editor.dangerInterval = 2;
  editor.tabCountdown = 3;
  const completing = editor.completeSession(true);
  assert.equal(editor.active, false);
  assert.equal(editor._completing, true);
  assert.deepEqual(cleared.slice(0, 3), [1, 2, 3]);
  assert.equal(editor.vignette.style.opacity, 0);
  // A reader can take their time naming the document; all words still save.
  resolveTitle('My reflection');
  await completing;
  assert.equal(completed.length, 1);
  assert.equal(completed[0].title, 'My reflection');
  assert.equal(completed[0].content, '<p>All 200 words survive.</p>');
  assert.equal(completed[0].duration, 180);
});
