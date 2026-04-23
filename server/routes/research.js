const express = require('express');
const { findOne, updateOne } = require('../utils/storage');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const FREE_WEEKLY_LIMIT = 5;
const PRO_WEEKLY_LIMIT = 50;

function isoWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function resolveAIUsage(user) {
  const usage = user.aiResearchUsedWeek || { week: '', count: 0 };
  if (usage.week !== isoWeek()) return { week: isoWeek(), count: 0 };
  return usage;
}

// ===== Wikipedia + DuckDuckGo Search (free, unlimited) =====
router.get('/wiki', authenticate, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    const wikiPromise = (async () => {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&limit=6&format=json&search=${encodeURIComponent(q)}`;
      const searchResp = await fetch(searchUrl, { headers: { 'User-Agent': 'iWrite/1.0' } });
      const searchData = await searchResp.json();
      const titles = searchData[1] || [];
      const descs = searchData[2] || [];
      const urls = searchData[3] || [];
      if (!titles.length) return { summary: null, alternatives: [] };

      const topTitle = titles[0];
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topTitle)}`;
      const sumResp = await fetch(summaryUrl, { headers: { 'User-Agent': 'iWrite/1.0' } });
      let summary = null;
      if (sumResp.ok) {
        const sumData = await sumResp.json();
        summary = {
          title: sumData.title,
          extract: sumData.extract,
          thumbnail: sumData.thumbnail?.source || null,
          url: sumData.content_urls?.desktop?.page || urls[0]
        };
      }
      const alternatives = titles.slice(1).map((t, i) => ({
        title: t,
        url: urls[i + 1],
        snippet: descs[i + 1] || ''
      }));
      return { summary, alternatives };
    })().catch(e => { console.error('[research/wiki] wiki error:', e); return { summary: null, alternatives: [] }; });

    const ddgPromise = (async () => {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
      const resp = await fetch(ddgUrl, { headers: { 'User-Agent': 'iWrite/1.0' } });
      if (!resp.ok) return { abstract: null, related: [] };
      const data = await resp.json();
      const abstract = data.AbstractText ? {
        text: data.AbstractText,
        source: data.AbstractSource || 'DuckDuckGo',
        url: data.AbstractURL || ''
      } : null;
      const related = (data.RelatedTopics || [])
        .filter(t => t && t.Text && t.FirstURL)
        .slice(0, 5)
        .map(t => ({ text: t.Text, url: t.FirstURL }));
      return { abstract, related };
    })().catch(e => { console.error('[research/wiki] ddg error:', e); return { abstract: null, related: [] }; });

    const [wiki, ddg] = await Promise.all([wikiPromise, ddgPromise]);
    res.json({ query: q, summary: wiki.summary, alternatives: wiki.alternatives, ddg });
  } catch (e) {
    console.error('[research/wiki] error:', e);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ===== Wikipedia full article text =====
router.get('/wiki/full', authenticate, async (req, res) => {
  const title = (req.query.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Missing title' });

  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(title)}`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'iWrite/1.0' } });
    if (!resp.ok) return res.status(502).json({ error: 'Wikipedia fetch failed' });
    const data = await resp.json();
    const pages = data?.query?.pages || {};
    const page = Object.values(pages)[0];
    if (!page || page.missing !== undefined) return res.status(404).json({ error: 'Article not found' });
    const extract = page.extract || '';
    const maxChars = 12000;
    const truncated = extract.length > maxChars;
    res.json({
      title: page.title,
      extract: truncated ? extract.slice(0, maxChars) + '…' : extract,
      truncated,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`
    });
  } catch (e) {
    console.error('[research/wiki/full] error:', e);
    res.status(500).json({ error: 'Fetch failed' });
  }
});

// ===== AI Ask (Gemini, quota'd) =====
router.post('/ask', authenticate, async (req, res) => {
  const question = (req.body?.question || '').trim();
  const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
  if (!question) return res.status(400).json({ error: 'Missing question' });
  if (question.length > 4000) return res.status(400).json({ error: 'Question too long (4000 char max)' });
  // Keep last 10 turns for context, validate shape
  const history = rawHistory
    .filter(m => m && (m.role === 'user' || m.role === 'ai') && typeof m.text === 'string' && m.text.trim())
    .slice(-10)
    .map(m => ({ role: m.role === 'ai' ? 'model' : 'user', parts: [{ text: m.text.slice(0, 4000) }] }));

  const user = await findOne('users.json', u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const isPro = user.plan === 'premium';
  const limit = isPro ? PRO_WEEKLY_LIMIT : FREE_WEEKLY_LIMIT;
  const usage = resolveAIUsage(user);
  if (usage.count >= limit) {
    return res.status(429).json({
      error: 'weekly_limit',
      message: isPro
        ? `You've used all ${limit} AI questions this week.`
        : `You've used this week's ${FREE_WEEKLY_LIMIT} AI questions. Upgrade to PRO for ${PRO_WEEKLY_LIMIT}/week.`,
      limit,
      used: usage.count,
      isPro
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'AI service not configured' });
  }

  const systemPreamble = `You are a research assistant for a writer. Answer concisely and factually. If you're not sure, say so. Keep responses under 200 words unless the question genuinely needs more. Maintain context from prior messages in the conversation.`;
  const contents = [
    ...history,
    { role: 'user', parts: [{ text: question }] }
  ];

  try {
    const callGemini = async (modelId) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPreamble }] },
          contents,
          generationConfig: { temperature: 0.4, maxOutputTokens: 600 }
        })
      });
    };

    let resp = await callGemini('gemini-2.5-flash');
    // Retry on transient 503 UNAVAILABLE, then fall back to gemini-2.0-flash
    if (resp.status === 503) {
      await new Promise(r => setTimeout(r, 800));
      resp = await callGemini('gemini-2.5-flash');
      if (resp.status === 503) {
        resp = await callGemini('gemini-2.0-flash');
      }
    }

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('[research/ask] gemini error:', resp.status, errText);
      if (resp.status === 503) {
        return res.status(503).json({ error: 'AI is busy right now. Try again in a moment.' });
      }
      if (resp.status === 429) {
        return res.status(503).json({ error: 'AI rate limit hit. Try again shortly.' });
      }
      return res.status(502).json({ error: 'AI service error. Please try again.' });
    }

    const data = await resp.json();
    const answer = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    if (!answer) return res.status(502).json({ error: 'No response from AI' });

    await updateOne('users.json', u => u.id === user.id, {
      aiResearchUsedWeek: { week: isoWeek(), count: usage.count + 1 }
    });

    res.json({
      answer,
      usage: { used: usage.count + 1, limit },
      isPro
    });
  } catch (e) {
    console.error('[research/ask] error:', e);
    res.status(500).json({ error: 'AI request failed' });
  }
});

// ===== Quota check =====
router.get('/quota', authenticate, async (req, res) => {
  const user = await findOne('users.json', u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const isPro = user.plan === 'premium';
  const limit = isPro ? PRO_WEEKLY_LIMIT : FREE_WEEKLY_LIMIT;
  const usage = resolveAIUsage(user);
  res.json({ used: usage.count, limit, isPro, week: isoWeek() });
});

module.exports = router;
