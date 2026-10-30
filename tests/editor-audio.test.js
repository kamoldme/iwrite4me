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
  const sandbox = { Audio, URL, clearTimeout, clearInterval, App: { toast: (...args) => toasts.push(args) }, document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null } };
  vm.runInNewContext(source + '\nglobalThis.editorUnderTest = Editor;', sandbox);
  return { editor: sandbox.editorUnderTest, sandbox, media, starts, toasts };
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

test('YouTube links accept common video URL forms and reject lookalike hosts', () => {
  const { editor } = fixture();
  for (const url of [
    'https://www.youtube.com/watch?v=M7lc1UVf-VE&list=anything',
    'https://youtu.be/M7lc1UVf-VE?si=share',
    'https://youtube.com/shorts/M7lc1UVf-VE',
    'https://m.youtube.com/live/M7lc1UVf-VE',
    'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE'
  ]) assert.equal(editor._parseYouTubeId(url), 'M7lc1UVf-VE');
  for (const url of ['https://notyoutube.com/watch?v=M7lc1UVf-VE', 'https://youtu.be.evil.test/M7lc1UVf-VE', 'https://youtube.com/watch?v=bad', 'javascript:alert(1)', 'bad']) {
    assert.equal(editor._parseYouTubeId(url), null);
  }
});

function youtubeFixture(t) {
  const f = fixture();
  const nodes = Object.fromEntries(['yt-player-container', 'audio-yt-status', 'audio-yt-play', 'audio-yt-controls', 'audio-yt-vol'].map(id => [id, { hidden: true, style: {}, value: '40', setAttribute() {} }]));
  const players = [];
  f.sandbox.document.getElementById = id => nodes[id] || null;
  f.sandbox.location = { origin: 'https://staging.example.test' };
  f.sandbox.setTimeout = setTimeout;
  f.sandbox.window = { YT: { Player: function(id, options) {
    const p = { options, destroyed: false, played: 0, paused: 0, setVolume(v) { this.volume = v; }, playVideo() { this.played++; }, pauseVideo() { this.paused++; }, destroy() { this.destroyed = true; } };
    players.push(p); return p;
  } } };
  f.editor._startSeekSync = () => {};
  t.after(() => f.editor.stopAudio());
  return { ...f, nodes, players };
}

test('stopping while YouTube API loads cannot start a stale player', async t => {
  const { editor, players } = youtubeFixture(t);
  let ready;
  editor._loadYTAPI = () => new Promise(resolve => { ready = resolve; });
  const pending = editor.playYouTube('https://youtu.be/M7lc1UVf-VE');
  editor.stopAudio(); ready(); await pending;
  assert.equal(players.length, 0);
  assert.equal(editor._activeAudioKey, null);
});

test('YouTube uses real readiness, playback and blocked-autoplay events', async t => {
  const { editor, players, nodes } = youtubeFixture(t);
  await editor.playYouTube('https://youtube.com/live/M7lc1UVf-VE');
  const p = players[0];
  assert.equal(editor._audioPlaying, false);
  assert.equal(p.options.height, '200');
  assert.equal(p.options.playerVars.origin, 'https://staging.example.test');
  p.options.events.onReady({ target: p });
  assert.equal(p.volume, 40);
  assert.equal(p.played, 1);
  p.options.events.onStateChange({ data: 1 });
  assert.equal(editor._audioPlaying, true);
  editor._toggleYTPause(); assert.equal(p.paused, 1);
  p.options.events.onStateChange({ data: 2 });
  assert.equal(editor._audioPlaying, false);
  editor._toggleYTPause(); assert.equal(p.played, 2);
  p.options.events.onAutoplayBlocked();
  assert.equal(editor._audioLoading, false);
  assert.match(nodes['audio-yt-status'].textContent, /Press play/);
  editor.stopAudio();
  p.options.events.onStateChange({ data: 1 });
  assert.equal(editor._audioPlaying, false);
});

test('restricted YouTube videos stop cleanly and give a usable error', async t => {
  const { editor, players, nodes } = youtubeFixture(t);
  await editor.playYouTube('https://youtu.be/M7lc1UVf-VE');
  players[0].options.events.onError({ data: 150 });
  assert.equal(players[0].destroyed, true);
  assert.equal(editor._audioLoading, false);
  assert.equal(editor._activeAudioKey, null);
  assert.equal(nodes['yt-player-container'].hidden, true);
  assert.match(nodes['audio-yt-status'].textContent, /Try another/);
});

test('failed YouTube API loading resets for retry instead of polling forever', async () => {
  const { editor, sandbox } = fixture();
  const tags = [];
  sandbox.window = {};
  sandbox.setTimeout = () => 1;
  sandbox.clearTimeout = () => {};
  sandbox.document.head = { appendChild: tag => tags.push(tag) };
  sandbox.document.createElement = () => ({ remove() { this.removed = true; } });
  const pending = editor._loadYTAPI();
  assert.equal(tags.length, 1);
  tags[0].onerror();
  await assert.rejects(pending, /could not load/);
  assert.equal(editor._ytAPIPromise, null);
  assert.equal(tags[0].removed, true);
  const retry = editor._loadYTAPI();
  assert.equal(tags.length, 2);
  sandbox.window.YT = { Player() {} };
  sandbox.window.onYouTubeIframeAPIReady();
  await retry;
  assert.equal(editor._ytAPIReady, true);
});

test('Pink Noise is a looped local recording using the shared pause and stop lifecycle', async () => {
  const { editor, media, starts } = fixture();
  editor.playAudio('pink'); starts[0].resolve(); await settle();
  assert.equal(media[0].src, '/media/ambient/pink-noise.wav');
  assert.equal(media[0].loop, true);
  editor.playAudio('pink');
  assert.equal(editor._audioPlaying, false);
  editor.stopAudio();
  assert.equal(media[0].currentTime, 0);
});

test('YouTube API timeout ends loading and permits another attempt', async () => {
  const { editor, sandbox } = fixture();
  let expire;
  sandbox.window = {};
  sandbox.setTimeout = callback => { expire = callback; return 1; };
  sandbox.clearTimeout = () => {};
  sandbox.document.createElement = () => ({ remove() {} });
  sandbox.document.head = { appendChild() {} };
  const pending = editor._loadYTAPI();
  expire();
  await assert.rejects(pending, /could not load/);
  assert.equal(editor._ytAPIPromise, null);
  assert.equal(sandbox.window.onYouTubeIframeAPIReady, undefined);
});
