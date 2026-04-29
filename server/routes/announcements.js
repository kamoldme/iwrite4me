const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuid } = require('uuid');
const { findMany, findOne, insertOne, updateOne } = require('../utils/storage');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logAction } = require('../utils/logger');

const router = express.Router();

const ANNOUNCEMENTS_DIR = path.join(__dirname, '../data/announcements');
if (!fs.existsSync(ANNOUNCEMENTS_DIR)) fs.mkdirSync(ANNOUNCEMENTS_DIR, { recursive: true });

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only images allowed'));
    cb(null, true);
  }
});

const VALID_CATEGORIES = ['update', 'news', 'feature', 'tip'];
const VALID_AUDIENCES = ['everyone', 'pro'];

// ───────── User-facing: list visible announcements for current user ─────────
// ?archive=1 returns ALL announcements (including inactive) for the Help → History view
router.get('/', authenticate, async (req, res) => {
  try {
    const user = await findOne('users.json', u => u.id === req.user.id);
    const isArchive = req.query.archive === '1' || req.query.archive === 'true';
    const all = await findMany('announcements.json', a => isArchive ? true : a.active !== false);
    const isPro = user?.plan === 'premium';

    const visible = all
      .filter(a => a.audience === 'everyone' || (a.audience === 'pro' && isPro))
      .sort((a, b) => {
        if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

    res.json(visible);
  } catch (err) {
    console.error('List announcements error:', err);
    res.status(500).json({ error: 'Failed to load announcements' });
  }
});

// ───────── Admin: list all (active + inactive) ─────────
router.get('/admin/list', authenticate, requireAdmin, async (req, res) => {
  try {
    const all = await findMany('announcements.json');
    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(all);
  } catch (err) {
    console.error('Admin list announcements error:', err);
    res.status(500).json({ error: 'Failed to load announcements' });
  }
});

// ───────── Admin: create ─────────
router.post('/admin', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, subtitle, body, category, audience, imageUrl, linkUrl, linkLabel, pinned } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });
    if (title.length > 80) return res.status(400).json({ error: 'Title too long (max 80 chars)' });
    if (subtitle && subtitle.length > 120) return res.status(400).json({ error: 'Subtitle too long (max 120 chars)' });
    if (body.length > 500) return res.status(400).json({ error: 'Body too long (max 500 chars)' });
    if (category && !VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
    if (audience && !VALID_AUDIENCES.includes(audience)) return res.status(400).json({ error: 'Invalid audience' });

    const announcement = {
      id: uuid(),
      title: title.trim(),
      subtitle: subtitle ? subtitle.trim() : null,
      body: body.trim(),
      category: category || 'update',
      audience: audience || 'everyone',
      imageUrl: imageUrl || null,
      linkUrl: linkUrl || null,
      linkLabel: linkLabel || null,
      pinned: !!pinned,
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: req.user.id
    };
    await insertOne('announcements.json', announcement);

    logAction('announcement_created', {
      announcementId: announcement.id,
      title: announcement.title,
      audience: announcement.audience
    }, req.user.id);

    try { require('../telegram').notifyAnnouncementPublished?.(announcement); } catch {}

    res.json(announcement);
  } catch (err) {
    console.error('Create announcement error:', err);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// ───────── Admin: update ─────────
router.patch('/admin/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, subtitle, body, category, audience, imageUrl, linkUrl, linkLabel, pinned, active } = req.body || {};
    const updates = {};
    if (title !== undefined) {
      if (title.length > 80) return res.status(400).json({ error: 'Title too long' });
      updates.title = title.trim();
    }
    if (subtitle !== undefined) {
      if (subtitle && subtitle.length > 120) return res.status(400).json({ error: 'Subtitle too long' });
      updates.subtitle = subtitle ? subtitle.trim() : null;
    }
    if (body !== undefined) {
      if (body.length > 500) return res.status(400).json({ error: 'Body too long' });
      updates.body = body.trim();
    }
    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
      updates.category = category;
    }
    if (audience !== undefined) {
      if (!VALID_AUDIENCES.includes(audience)) return res.status(400).json({ error: 'Invalid audience' });
      updates.audience = audience;
    }
    if (imageUrl !== undefined) updates.imageUrl = imageUrl || null;
    if (linkUrl !== undefined) updates.linkUrl = linkUrl || null;
    if (linkLabel !== undefined) updates.linkLabel = linkLabel || null;
    if (pinned !== undefined) updates.pinned = !!pinned;
    if (active !== undefined) updates.active = !!active;
    updates.updatedAt = new Date().toISOString();

    const updated = await updateOne('announcements.json', a => a.id === req.params.id, updates);
    if (!updated) return res.status(404).json({ error: 'Announcement not found' });
    res.json(updated);
  } catch (err) {
    console.error('Update announcement error:', err);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// ───────── Admin: image upload ─────────
router.post('/admin/upload-image', authenticate, requireAdmin, imageUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const filename = `${uuid()}.jpg`;
    const filepath = path.join(ANNOUNCEMENTS_DIR, filename);
    // Accept any aspect ratio (portrait, landscape, square, panorama).
    // Resize fits inside a 1600x1600 box preserving aspect — no cropping.
    await sharp(req.file.buffer)
      .rotate() // honor EXIF orientation
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toFile(filepath);
    res.json({ imageUrl: `/uploads/announcements/${filename}` });
  } catch (err) {
    console.error('Announcement image upload error:', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// ───────── Admin: AI drafting (Gemini) ─────────
// Modes:
//   - whole-post: { intent, mode: 'draft' | 'improve' } → returns { title, body }
//   - per-field:  { intent?, currentValue?, field: 'title'|'subtitle'|'body'|'linkLabel', context? }
//                 → returns { value }
const FIELD_PROMPTS = {
  title: {
    rule: 'Output only the TITLE: punchy, specific, ≤80 chars. No quotes, no preamble.',
    cap: 80
  },
  subtitle: {
    rule: 'Output only the SUBTITLE: a 1-line tease that makes the reader want to expand the announcement. ≤120 chars, ideally ≤60 for best display. Specific, concrete. No clickbait.',
    cap: 120
  },
  body: {
    rule: 'Output only the BODY: brief informational text describing what changed and what the user should do. ≤500 chars. Plain text. Line breaks OK. No quotes, no preamble.',
    cap: 500
  },
  linkLabel: {
    rule: 'Output only a 2-3 word call-to-action label for a button. Action verb. Examples: "Read more", "Try it", "See changes". No quotes.',
    cap: 30
  }
};

// Platform-wide Gemini tracking lives in server/utils/aiMetrics.js so research
// and announcement drafting share one counter. No per-user limits here.
const { incrementPlatformAI, getPlatformAIMetrics } = require('../utils/aiMetrics');

// Forgiving JSON parser — strips code fences and surrounding prose, then
// extracts the first {...} block before parsing. Returns null on failure.
function parseLooseJson(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  // Strip ```json ... ``` or ``` ... ``` fences
  s = s.replace(/^```(?:json|text)?\s*/i, '').replace(/\s*```\s*$/i, '');
  // Try direct parse first
  try { return JSON.parse(s); } catch {}
  // Extract the first balanced {...} substring
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const slice = s.slice(first, last + 1);
    try { return JSON.parse(slice); } catch {}
  }
  return null;
}

router.post('/admin/draft', authenticate, requireAdmin, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI service not configured' });

  const { intent, mode, field, currentValue, context } = req.body || {};
  const isFieldMode = field && FIELD_PROMPTS[field];

  if (!isFieldMode && (!intent || !intent.trim())) {
    return res.status(400).json({ error: 'Intent is required' });
  }
  if (isFieldMode && !intent?.trim() && !currentValue?.trim() && !context) {
    return res.status(400).json({ error: 'Intent, current value, or context is required' });
  }

  const baseSystem = `You are drafting in-app announcements for iWrite, a focused-writing platform. Users see your message in a small card on their dashboard with a "tap to expand" interaction model — title and subtitle in the compact card, body and image in the expanded view.

PRODUCT CONTEXT
iWrite is a writing app where users complete timed sessions, build daily streaks (which grow a tree from seed to World Tree), earn XP/levels, and compete on a leaderboard. PRO is a paid tier ($1.99/mo) that unlocks: custom timer durations, custom danger-mode inactivity timer, YouTube background music, larger word/edit limits, folders, PDF export, full session analytics, username changes, Pro badge, priority support. There's a community tab for publishing stories with comments and likes, friends, follow, duels (head-to-head writing challenges), and referrals (every 5 referrals = free PRO).

VOICE
- Specific, concrete, plain. Active voice. Short sentences.
- Use product nouns when relevant: streak, tree, dangerous mode, leaderboard, duel, Pro, session, XP, story.
- Tell users what changed and what to do next. No hype.

DO NOT
- Use em-dashes (—) or en-dashes (–). Use periods or commas instead.
- Use AI clichés: "delve", "leverage", "unlock", "elevate", "in today's fast-paced world", "we're thrilled", "exciting news", "introducing".
- Use marketing fluff. No "Hello writers!" or "Hey everyone!".
- Use emojis unless the input asks for them.
- Add a sign-off like "Happy writing!".`;

  let systemInstruction;
  let userPrompt;
  let useJson = true;

  if (isFieldMode) {
    useJson = false;
    systemInstruction = baseSystem + `\n\nTASK\n${FIELD_PROMPTS[field].rule}`;
    const ctxBits = [];
    if (context?.title) ctxBits.push(`Existing title: ${context.title}`);
    if (context?.subtitle && field !== 'subtitle') ctxBits.push(`Existing subtitle: ${context.subtitle}`);
    if (context?.body && field !== 'body') ctxBits.push(`Existing body: ${context.body}`);
    const ctxStr = ctxBits.length ? `Context from other fields:\n${ctxBits.join('\n')}\n\n` : '';
    if (currentValue?.trim() && intent?.trim()) {
      userPrompt = `${ctxStr}Current ${field}: ${currentValue.slice(0, 1000)}\n\nUser instruction: ${intent.slice(0, 1000)}\n\nRewrite the ${field} accordingly.`;
    } else if (currentValue?.trim()) {
      userPrompt = `${ctxStr}Current ${field}: ${currentValue.slice(0, 1000)}\n\nImprove this ${field}. Tighten language. Remove anything that violates the rules above.`;
    } else if (intent?.trim()) {
      userPrompt = `${ctxStr}Generate the ${field} based on this intent: ${intent.slice(0, 1000)}`;
    } else {
      userPrompt = `${ctxStr}Generate the ${field} based on the context above.`;
    }
  } else {
    systemInstruction = baseSystem + `\n\nFORMAT CONSTRAINTS\n- Title: under 80 characters. Specific. No clickbait.\n- Body: under 500 characters. Plain text. Line breaks OK.\n\nOUTPUT FORMAT\nReturn strict JSON with two keys: {"title": string, "body": string}. No prose, no preamble, no code fences.`;
    userPrompt = mode === 'improve'
      ? `Improve this announcement. Keep the meaning but tighten the language and remove anything that violates the rules above.\n\n${intent.slice(0, 2000)}`
      : `Draft an announcement based on this intent:\n\n${intent.slice(0, 2000)}`;
  }

  try {
    const callGemini = async (modelId) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
      const genConfig = { temperature: 0.5, maxOutputTokens: 600 };
      if (useJson) genConfig.responseMimeType = 'application/json';
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: genConfig
        })
      });
    };

    let resp = await callGemini('gemini-2.5-flash');
    if (resp.status === 503) {
      await new Promise(r => setTimeout(r, 800));
      resp = await callGemini('gemini-2.5-flash');
      if (resp.status === 503) resp = await callGemini('gemini-2.0-flash');
    }
    if (!resp.ok) {
      const errText = await resp.text();
      console.error('[announcements/draft] gemini error:', resp.status, errText);
      if (resp.status === 503) return res.status(503).json({ error: 'AI is busy. Try again in a moment.' });
      if (resp.status === 429) return res.status(503).json({ error: 'AI rate limit hit.' });
      return res.status(502).json({ error: 'AI service error.' });
    }

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';

    // Track platform-wide AI usage
    const metrics = await incrementPlatformAI(isFieldMode ? `announcement-${field}` : 'announcement-draft');
    const platform = metrics ? {
      total: metrics.totalCalls,
      today: metrics.callsToday,
      thisWeek: metrics.callsThisWeek
    } : null;

    if (isFieldMode) {
      // Strip surrounding quotes / code fences Gemini sometimes adds
      let cleaned = text.trim();
      cleaned = cleaned.replace(/^```(?:json|text)?\s*/i, '').replace(/\s*```\s*$/i, '');
      cleaned = cleaned.replace(/^["']+|["']+$/g, '').trim();
      const value = cleaned.slice(0, FIELD_PROMPTS[field].cap);
      if (!value) return res.status(502).json({ error: 'AI returned empty result' });
      return res.json({ value, platform });
    }

    // Forgiving JSON parse: strip code fences, extract first {...} block.
    const parsed = parseLooseJson(text);
    if (!parsed) {
      console.warn('[announcements/draft] could not parse JSON. Raw text:', text.slice(0, 500));
      return res.status(502).json({ error: 'AI returned malformed response. Try again.' });
    }

    const title = (parsed.title || '').slice(0, 80);
    const body = (parsed.body || '').slice(0, 500);
    if (!title || !body) {
      console.warn('[announcements/draft] missing title/body. Parsed:', JSON.stringify(parsed).slice(0, 500));
      return res.status(502).json({ error: 'AI did not return title and body' });
    }

    res.json({ title, body, platform });
  } catch (err) {
    console.error('Announcement draft error:', err);
    res.status(500).json({ error: 'Failed to draft announcement' });
  }
});

// ───────── Admin: platform AI usage metrics ─────────
router.get('/admin/platform-ai-usage', authenticate, requireAdmin, async (req, res) => {
  try {
    res.json(await getPlatformAIMetrics());
  } catch (err) {
    console.error('Platform AI metrics error:', err);
    res.status(500).json({ error: 'Failed to load AI metrics' });
  }
});

module.exports = router;
