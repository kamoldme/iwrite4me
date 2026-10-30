const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/js/editor.js'), 'utf8');
function fixture() {
  const media = [], starts = [], toasts = [];
  class Audio {
    constructor() { this.paused = true; this.currentTime = 0; media.push(this); }
    play() { this.paused = false; return new Promise((resolve, reject) => starts.push({ resolve, reject })); }
    pause() { this.paused = true; }
  }
  const sandbox = { Audio, clearInterval, App: { toast: (...args) => toasts.push(args) }, document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null } };
  vm.runInNewContext(source + '\nglobalThis.editorUnderTest = Editor;', sandbox);
  return { editor: sandbox.editorUnderTest, media, starts, toasts };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
test('a previous play promise cannot mark a newly selected track as playing', async () => {
  const { editor, media, starts } = fixture();
  editor.playAudio('lofi1');
  assert.equal(editor._audioLoading, true);
  assert.equal(editor._audioPlaying, false);
  editor.playAudio('lofi2');
  starts[0].resolve(); await settle();
  assert.equal(media[0].paused, true);
  assert.equal(editor._activeAudioKey, 'lofi2');
  assert.equal(editor._audioPlaying, false);
  starts[1].resolve(); await settle();
  assert.equal(editor._audioPlaying, true);
  assert.equal(editor._audioLoading, false);
});
test('pause, resume and stop reuse the original buffered media element', async () => {
  const { editor, media, starts } = fixture();
  editor.playAudio('rain'); starts[0].resolve(); await settle();
  editor.playAudio('rain');
  assert.equal(editor._audioPlaying, false);
  editor.playAudio('rain'); starts[1].resolve(); await settle();
  assert.equal(editor._audioPlaying, true);
  editor.stopAudio();
  assert.equal(editor._audioPlaying, false);
  assert.equal(media[0].currentTime, 0);
  assert.equal(media[0].src, editor._audioSources.rain);
  editor.playAudio('rain'); starts[2].resolve(); await settle();
  assert.equal(media.length, 1);
  assert.equal(editor._audioPlaying, true);
});
test('cancelling a pending start suppresses stale state and abort errors', async () => {
  const { editor, starts, toasts } = fixture();
  editor.playAudio('brown');
  editor.playAudio('brown');
  starts[0].reject({ name: 'AbortError' }); await settle();
  assert.equal(editor._audioLoading, false);
  assert.equal(editor._audioPlaying, false);
  assert.equal(toasts.length, 0);
});
test('failed playback resets loading and reports the error once', async () => {
  const { editor, starts, toasts } = fixture();
  editor.playAudio('wind');
  starts[0].reject({ name: 'NotSupportedError' }); await settle();
  assert.equal(editor._audioLoading, false);
  assert.equal(editor._audioPlaying, false);
  assert.equal(toasts.length, 1);
});
test('stopping during a pending start prevents a late promise from restarting UI', async () => {
  const { editor, starts } = fixture();
  editor.playAudio('hz40'); editor.stopAudio();
  starts[0].resolve(); await settle();
  assert.equal(editor._activeAudioKey, null);
  assert.equal(editor._audioLoading, false);
  assert.equal(editor._audioPlaying, false);
});
