'use strict';

// Allowlist sanitizer for writing-session HTML (the contenteditable editor).
// Everything that is not a recognised, allowed tag is escaped as text, so a
// malformed or unexpected construct degrades to visible text, never to markup.

const DROP_WITH_CONTENT = 'script|style|iframe|object|embed|svg|math|form|input|button|textarea|select|option|meta|link|base|template|noscript|title|frame|frameset|applet';

const ALLOWED_TAGS = new Set([
  'p', 'div', 'br', 'span', 'font', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'sub', 'sup', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'hr'
]);
const VOID_TAGS = new Set(['br', 'hr']);

const STYLE_PROPS = new Set([
  'color', 'background-color', 'font-size', 'font-family', 'font-weight', 'font-style',
  'text-decoration', 'text-decoration-line', 'text-align'
]);
const SAFE_STYLE_VALUE = /^[#(),.%\w\s'"-]{1,120}$/;
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s.,%]+\))$/i;
const SAFE_FACE = /^[\w\s,'"-]{1,80}$/;
const SAFE_ALIGN = /^(left|right|center|justify)$/i;

function decodeEntities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, n) => safeCodePoint(parseInt(n, 10)))
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39|tab|newline|colon);/gi, (m, name) => ({
      nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", tab: '\t', newline: '\n', colon: ':'
    })[name.toLowerCase()] ?? m);
}

function safeCodePoint(n) {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return '';
  try { return String.fromCodePoint(n); } catch { return ''; }
}

function escapeText(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeHref(raw) {
  // Strip whitespace and control characters browsers ignore inside a scheme ("java\tscript:").
  const href = decodeEntities(raw).replace(/[\u0000- \u007f-\u009f]/g, '');
  if (!href) return '';
  return /^(https?:|mailto:|\/(?!\/)|#)/i.test(href) ? href : '';
}

function safeStyle(raw) {
  const css = decodeEntities(raw);
  if (/url\s*\(|expression|javascript:|@import|\\|\/\*|<|>/i.test(css)) return '';
  const out = [];
  for (const decl of css.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (STYLE_PROPS.has(prop) && value && SAFE_STYLE_VALUE.test(value)) out.push(`${prop}: ${value}`);
  }
  return out.join('; ');
}

function parseAttrs(rawAttrs) {
  const attrs = {};
  const re = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(rawAttrs || ''))) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

function buildTag(tag, rawAttrs) {
  const attrs = parseAttrs(rawAttrs);
  const keep = [];
  if (tag === 'a') {
    const href = safeHref(attrs.href);
    if (href) keep.push(`href="${escapeText(href)}"`, 'target="_blank"', 'rel="noopener noreferrer nofollow"');
  }
  if (tag === 'font') {
    const color = decodeEntities(attrs.color).trim();
    if (color && SAFE_COLOR.test(color)) keep.push(`color="${escapeText(color)}"`);
    const size = decodeEntities(attrs.size).trim();
    if (/^[1-7]$/.test(size)) keep.push(`size="${size}"`);
    const face = decodeEntities(attrs.face).trim();
    if (face && SAFE_FACE.test(face)) keep.push(`face="${escapeText(face)}"`);
  }
  if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'li'].includes(tag)) {
    const align = decodeEntities(attrs.align).trim();
    if (SAFE_ALIGN.test(align)) keep.push(`align="${align.toLowerCase()}"`);
  }
  if (attrs.style !== undefined) {
    const style = safeStyle(attrs.style);
    if (style) keep.push(`style="${escapeText(style)}"`);
  }
  return `<${tag}${keep.length ? ' ' + keep.join(' ') : ''}>`;
}

// Session tabs are stored as <!--iwrite-tab:NAME--> markers between tab bodies
// (see public/js/editor.js _serializeTabs). Keep them; sanitize each body on its own.
const TAB_MARKER_RE = /<!--iwrite-tab:([^>]*?)-->/g;

function cleanTabName(name) {
  const cleaned = decodeEntities(name).replace(/[<>]/g, '').replace(/-{2,}/g, '-').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60);
  return cleaned || 'Draft';
}

function sanitizeDocumentHtml(html) {
  if (typeof html !== 'string' || !html) return '';
  const parts = html.split(TAB_MARKER_RE);
  if (parts.length === 1) return sanitizeFragment(html);
  let out = sanitizeFragment(parts[0]);
  for (let i = 1; i < parts.length; i += 2) {
    out += `<!--iwrite-tab:${cleanTabName(parts[i])}-->` + sanitizeFragment(parts[i + 1] || '');
  }
  return out;
}

function sanitizeFragment(html) {
  if (!html) return '';
  const dropRe = new RegExp(`<(${DROP_WITH_CONTENT})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi');
  const dropOpenRe = new RegExp(`<\\/?(${DROP_WITH_CONTENT})\\b[^>]*>`, 'gi');
  const source = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, '')
    .replace(/<![^>]*>|<\?[^>]*>/g, '')
    .replace(dropRe, '')
    .replace(dropOpenRe, '');

  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^>]*)?)\/?>/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = tagRe.exec(source))) {
    out += escapeText(decodeEntities(source.slice(last, m.index)));
    last = m.index + m[0].length;
    const tag = m[2].toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) continue;
    if (m[1]) { if (!VOID_TAGS.has(tag)) out += `</${tag}>`; continue; }
    out += VOID_TAGS.has(tag) ? `<${tag}>` : buildTag(tag, m[3]);
  }
  out += escapeText(decodeEntities(source.slice(last)));
  // Keep non-breaking spaces readable rather than as escaped literals.
  return out.replace(/ /g, '&nbsp;');
}

const ALLOWED_MODES = new Set(['normal', 'dangerous', 'zen', 'duel', 'research']);
function sanitizeMode(mode) {
  return ALLOWED_MODES.has(mode) ? mode : 'normal';
}

module.exports = { sanitizeDocumentHtml, sanitizeMode, ALLOWED_MODES };
