const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeDocumentHtml: clean, sanitizeMode } = require('../server/utils/sanitize-html');

// Only real tags can execute; escaped text that mentions "onclick" is harmless.
const hasActiveContent = html => (html.match(/<[^>]*>/g) || []).some(tag =>
  /^<\/?(script|img|svg|iframe|object|embed|style|math|form|input|link|meta|base|details|body)\b/i.test(tag) ||
  /\son[a-z]+\s*=|javascript:|data:|href="\/\//i.test(tag));

test('removes script and event-handler payloads', () => {
  const payloads = [
    '<img src=x onerror="alert(1)">',
    '<p onmouseover="alert(1)">hi</p>',
    '<svg><script>alert(1)</script></svg>',
    '<script>alert(1)</script>',
    '<scr<script>ipt>alert(1)</script>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="java&#115;cript:alert(1)">x</a>',
    '<a href="java\tscript:alert(1)">x</a>',
    '<a href="&#x6A;avascript:alert(1)">x</a>',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    '<a href="//evil.example/">x</a>',
    '<font color="red" onclick="alert(1)">x</font>',
    '<font color="x&quot; onmouseover=alert(1)">x</font>',
    '<span style="background:url(javascript:alert(1))">x</span>',
    '<div style="width:expression(alert(1))">x</div>',
    '<p title="a>b" onclick=alert(1)>x</p>',
    '<details open ontoggle=alert(1)>',
    '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
    '<!--iwrite-tab:x--><img src=x onerror=alert(1)>-->',
    '<style>@import "//evil"</style>',
    '<body onload=alert(1)>',
    '<img src=x onerror=alert(1)//',
  ];
  for (const p of payloads) {
    const out = clean(p);
    assert.ok(!hasActiveContent(out), `still active: ${p} -> ${out}`);
  }
});

test('keeps the formatting the editor produces', () => {
  const html = '<div><b>Bold</b> <i>it</i> <u>u</u></div><div><font color="#ef4444">red</font> <font size="5">big</font></div><ul><li>one</li></ul><p>a<br>b</p>';
  assert.equal(clean(html), html);
  assert.equal(clean('<span style="color: rgb(239, 68, 68); font-size: 18px;">x</span>'),
    '<span style="color: rgb(239, 68, 68); font-size: 18px">x</span>');
  assert.equal(clean('<a href="https://example.com/a?b=1&amp;c=2">link</a>'),
    '<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer nofollow">link</a>');
});

test('keeps text that looks like markup as visible text', () => {
  assert.equal(clean('<div>5 &lt; 7 &amp; 9 &gt; 3</div>'), '<div>5 &lt; 7 &amp; 9 &gt; 3</div>');
  assert.equal(clean('a&nbsp;b'), 'a&nbsp;b');
  assert.equal(clean('<div>He said "hi" &amp; left</div>'), '<div>He said &quot;hi&quot; &amp; left</div>');
});

test('preserves session tab markers and neutralises tab names', () => {
  const html = '<!--iwrite-tab:Draft--><div>one</div><!--iwrite-tab:Notes--><div>two</div>';
  assert.equal(clean(html), html);
  const out = clean('<!--iwrite-tab:a--b--><div>x</div>');
  assert.ok(out.startsWith('<!--iwrite-tab:a-b-->'));
});

test('is stable when applied twice', () => {
  const html = '<div><font color="#22c55e">g</font> 5 &lt; 6 &amp; "q"</div><!--iwrite-tab:T--><p>x</p>';
  assert.equal(clean(clean(html)), clean(html));
});

test('document mode is restricted to known modes', () => {
  assert.equal(sanitizeMode('zen'), 'zen');
  assert.equal(sanitizeMode('<img src=x onerror=alert(1)>'), 'normal');
  assert.equal(sanitizeMode(undefined), 'normal');
});
