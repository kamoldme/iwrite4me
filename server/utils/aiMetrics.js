// Platform-wide Gemini call tracking — single counter for the whole app.
// Used by both announcement drafting (admin) and research (any user).

const { findOne, insertOne, updateOne } = require('./storage');

const AI_METRICS_ID = 'ai_metrics';

function isoWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function isoDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function incrementPlatformAI(source) {
  try {
    const existing = await findOne('app-settings.json', s => s.id === AI_METRICS_ID);
    const week = isoWeek();
    const day = isoDay();
    if (!existing) {
      const fresh = {
        id: AI_METRICS_ID,
        totalCalls: 1,
        callsThisWeek: 1,
        weekTag: week,
        callsToday: 1,
        dayTag: day,
        lastCallAt: new Date().toISOString(),
        bySource: { [source]: 1 }
      };
      await insertOne('app-settings.json', fresh);
      return fresh;
    }
    const updates = {
      totalCalls: (existing.totalCalls || 0) + 1,
      callsThisWeek: (existing.weekTag === week ? (existing.callsThisWeek || 0) : 0) + 1,
      weekTag: week,
      callsToday: (existing.dayTag === day ? (existing.callsToday || 0) : 0) + 1,
      dayTag: day,
      lastCallAt: new Date().toISOString(),
      bySource: { ...(existing.bySource || {}), [source]: ((existing.bySource || {})[source] || 0) + 1 }
    };
    await updateOne('app-settings.json', s => s.id === AI_METRICS_ID, updates);
    return { ...existing, ...updates };
  } catch (err) {
    console.warn('[ai-metrics] increment failed:', err.message);
    return null;
  }
}

async function getPlatformAIMetrics() {
  const m = await findOne('app-settings.json', s => s.id === AI_METRICS_ID);
  if (!m) return { total: 0, today: 0, thisWeek: 0, weekTag: isoWeek(), dayTag: isoDay(), bySource: {} };
  const week = isoWeek();
  const day = isoDay();
  return {
    total: m.totalCalls || 0,
    today: m.dayTag === day ? (m.callsToday || 0) : 0,
    thisWeek: m.weekTag === week ? (m.callsThisWeek || 0) : 0,
    weekTag: week,
    dayTag: day,
    lastCallAt: m.lastCallAt || null,
    bySource: m.bySource || {}
  };
}

module.exports = { incrementPlatformAI, getPlatformAIMetrics, isoWeek, isoDay, AI_METRICS_ID };
