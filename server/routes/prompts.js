const express = require('express');
const { v4: uuid } = require('uuid');
const { findMany, findOne, insertOne, updateOne, deleteOne } = require('../utils/storage');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const CATEGORIES = ['ielts', 'college', 'self', 'creative', 'random'];
const FREE_DAILY_LIMIT = 1;
const PRO_DAILY_LIMIT = 10;

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

async function resolveUsage(user) {
  const usage = user.promptsUsedToday || { date: '', count: 0 };
  if (usage.date !== todayStr()) return { date: todayStr(), count: 0 };
  return usage;
}

// ===== USER: get next prompt (consumes daily quota) =====
router.post('/next', authenticate, async (req, res) => {
  const { category } = req.body || {};
  if (category && !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }
  const user = await findOne('users.json', u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const isPro = user.plan === 'premium';
  const limit = isPro ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
  const usage = await resolveUsage(user);
  if (usage.count >= limit) {
    return res.status(429).json({
      error: 'daily_limit',
      message: isPro
        ? `You've used all ${limit} prompts today. Come back tomorrow.`
        : `You've used today's prompt. Upgrade to PRO for ${PRO_DAILY_LIMIT}/day.`,
      limit,
      isPro
    });
  }

  const prompts = await findMany('prompts.json', p => p.active !== false);
  if (!prompts.length) return res.status(404).json({ error: 'No prompts available' });

  const pool = (!category || category === 'random')
    ? prompts
    : prompts.filter(p => p.category === category);
  if (!pool.length) return res.status(404).json({ error: 'No prompts in this category' });

  const seen = user.promptHistory || [];
  const unseen = pool.filter(p => !seen.includes(p.id));
  const candidates = unseen.length ? unseen : pool;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];

  const newHistory = [...seen, picked.id].slice(-200);
  await updateOne('users.json', u => u.id === user.id, {
    promptsUsedToday: { date: todayStr(), count: usage.count + 1 },
    promptHistory: newHistory
  });
  await updateOne('prompts.json', p => p.id === picked.id, {
    usedCount: (picked.usedCount || 0) + 1
  });

  res.json({
    prompt: { id: picked.id, text: picked.text, category: picked.category, suggestedWords: picked.suggestedWords || null },
    usage: { used: usage.count + 1, limit },
    isPro
  });
});

// ===== USER: check remaining quota =====
router.get('/quota', authenticate, async (req, res) => {
  const user = await findOne('users.json', u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const isPro = user.plan === 'premium';
  const limit = isPro ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
  const usage = await resolveUsage(user);
  res.json({ used: usage.count, limit, isPro, categories: CATEGORIES });
});

// ===== ADMIN: CRUD =====
router.get('/admin/all', authenticate, requireAdmin, async (req, res) => {
  const prompts = await findMany('prompts.json');
  prompts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json({ prompts });
});

router.post('/admin', authenticate, requireAdmin, async (req, res) => {
  const { text, category, difficulty, suggestedWords } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });
  const cat = (category || 'random').toLowerCase();
  if (!CATEGORIES.includes(cat)) return res.status(400).json({ error: 'Invalid category' });
  const record = {
    id: uuid(),
    text: text.trim(),
    category: cat,
    difficulty: difficulty || 'medium',
    suggestedWords: suggestedWords ? parseInt(suggestedWords) : null,
    active: true,
    usedCount: 0,
    createdBy: 'admin',
    createdAt: new Date().toISOString()
  };
  await insertOne('prompts.json', record);
  res.json({ prompt: record });
});

router.patch('/admin/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const allowed = ['text', 'category', 'difficulty', 'suggestedWords', 'active'];
  const updates = {};
  for (const k of allowed) if (k in req.body) updates[k] = req.body[k];
  if (updates.category && !CATEGORIES.includes(updates.category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }
  const updated = await updateOne('prompts.json', p => p.id === id, updates);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json({ prompt: updated });
});

router.delete('/admin/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const ok = await deleteOne('prompts.json', p => p.id === id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = { router, CATEGORIES };
