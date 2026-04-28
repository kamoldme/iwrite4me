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
router.get('/', authenticate, async (req, res) => {
  try {
    const user = await findOne('users.json', u => u.id === req.user.id);
    const all = await findMany('announcements.json', a => a.active !== false);
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
    const { title, body, category, audience, imageUrl, linkUrl, linkLabel, pinned } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });
    if (title.length > 80) return res.status(400).json({ error: 'Title too long (max 80 chars)' });
    if (body.length > 500) return res.status(400).json({ error: 'Body too long (max 500 chars)' });
    if (category && !VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
    if (audience && !VALID_AUDIENCES.includes(audience)) return res.status(400).json({ error: 'Invalid audience' });

    const announcement = {
      id: uuid(),
      title: title.trim(),
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
    const { title, body, category, audience, imageUrl, linkUrl, linkLabel, pinned, active } = req.body || {};
    const updates = {};
    if (title !== undefined) {
      if (title.length > 80) return res.status(400).json({ error: 'Title too long' });
      updates.title = title.trim();
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
    await sharp(req.file.buffer)
      .resize(1200, null, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(filepath);
    res.json({ imageUrl: `/uploads/announcements/${filename}` });
  } catch (err) {
    console.error('Announcement image upload error:', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// ───────── Admin: AI drafting (Gemini) ─────────
router.post('/admin/draft', authenticate, requireAdmin, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI service not configured' });

  const { intent, mode } = req.body || {};
  if (!intent || typeof intent !== 'string' || !intent.trim()) {
    return res.status(400).json({ error: 'Intent is required' });
  }

  // Gemini system prompt: defines product context, format, and style
  const systemInstruction = `You are drafting in-app announcements for iWrite, a focused-writing platform. Users see your message in a small card on their dashboard.

PRODUCT CONTEXT
iWrite is a writing app where users complete timed sessions, build daily streaks (which grow a tree from seed to World Tree), earn XP/levels, and compete on a leaderboard. PRO is a paid tier ($1.99/mo) that unlocks: custom timer durations, custom danger-mode inactivity timer, YouTube background music, larger word/edit limits, folders, PDF export, full session analytics, username changes, Pro badge, priority support. There's a community tab for publishing stories with comments and likes, friends, follow, duels (head-to-head writing challenges), and referrals (every 5 referrals = free PRO).

FORMAT CONSTRAINTS
- Title: under 80 characters. Specific. No clickbait.
- Body: under 500 characters. Plain text. Line breaks OK.

VOICE
- Specific, concrete, plain. Active voice. Short sentences.
- Use product nouns: streak, tree, dangerous mode, leaderboard, duel, Pro, session, XP, story.
- Tell users what changed and what to do next. No hype.

DO NOT
- Use em-dashes (—) or en-dashes (–). Use periods or commas instead.
- Use AI clichés: "delve", "leverage", "unlock", "elevate", "in today's fast-paced world", "we're thrilled", "exciting news", "introducing".
- Use marketing fluff or filler. No "Hello writers!" or "Hey everyone!".
- Use emojis unless the input asks for them.
- Add a sign-off like "Happy writing!".

OUTPUT FORMAT
Return strict JSON with two keys: {"title": string, "body": string}. No prose, no preamble, no code fences.`;

  const userPrompt = mode === 'improve'
    ? `Improve this announcement. Keep the meaning but tighten the language and remove anything that violates the rules above.\n\n${intent.slice(0, 2000)}`
    : `Draft an announcement based on this intent:\n\n${intent.slice(0, 2000)}`;

  try {
    const callGemini = async (modelId) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 600, responseMimeType: 'application/json' }
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
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return res.status(502).json({ error: 'AI returned malformed response' }); }

    const title = (parsed.title || '').slice(0, 80);
    const body = (parsed.body || '').slice(0, 500);
    if (!title || !body) return res.status(502).json({ error: 'AI did not return title and body' });

    res.json({ title, body });
  } catch (err) {
    console.error('Announcement draft error:', err);
    res.status(500).json({ error: 'Failed to draft announcement' });
  }
});

module.exports = router;
