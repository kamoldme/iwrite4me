const express = require('express');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const { pool } = require('../utils/storage');
const { authenticate } = require('../middleware/auth');
const { sanitizeDocumentHtml } = require('../utils/sanitize-html');
const { cloudflareVisitor, isCloudflareEdge } = require('../utils/live-map');
const router = express.Router();

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const validToken = token => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
const sessionFonts = new Set(['sans', 'serif', 'mono', 'georgia', 'garamond', 'courier', 'dyslexic', 'fraunces', 'palatino', 'nunito', 'instrument', 'grotesk']);

// A rolling seven-day limit, enforced in PostgreSQL across app instances.
// Store a keyed digest instead of the visitor's IP address.
router.post('/start', async (req, res) => {
  const secret = process.env.GUEST_TRIAL_IP_SECRET || process.env.JWT_SECRET;
  if (!secret || !req.ip) return res.status(503).json({ error: 'Writing preview is temporarily unavailable.' });
  // Use Cloudflare's visitor header only when the proxy-reported peer belongs
  // to a known Cloudflare range. Otherwise use Express's trusted-proxy IP.
  const visitor = cloudflareVisitor(req);
  if (!visitor && isCloudflareEdge(req.ip)) return res.status(503).json({ error: 'Writing preview is temporarily unavailable.' });
  const visitorIp = visitor?.address || String(req.ip).replace(/^::ffff:/, '');
  const ipHash = crypto.createHmac('sha256', secret).update(visitorIp).digest('hex');
  const token = crypto.randomBytes(32).toString('hex');
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // Prune expired claim tokens and inactive network identifiers as the
    // service is used; no draft text is stored in these tables.
    await client.query("DELETE FROM guest_trial_claims WHERE expires_at < NOW()");
    await client.query("DELETE FROM guest_trial_limits WHERE started_at < NOW() - INTERVAL '7 days'");
    const result = await client.query(`INSERT INTO guest_trial_limits (ip_hash, started_at)
      VALUES ($1, NOW()) ON CONFLICT (ip_hash) DO UPDATE SET started_at = NOW()
      WHERE guest_trial_limits.started_at <= NOW() - INTERVAL '7 days'
      RETURNING started_at`, [ipHash]);
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(429).json({ code: 'GUEST_WEEKLY_LIMIT', error: 'This network has already used its free preview this week.' });
    }
    await client.query(`INSERT INTO guest_trial_claims (token_hash, document_id, started_at, expires_at)
      VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')`, [hashToken(token), uuid(), result.rows[0].started_at]);
    await client.query('COMMIT');
    res.status(201).json({ token, startedAt: result.rows[0].started_at });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Guest trial start failed:', error);
    res.status(500).json({ error: 'Could not start the writing preview.' });
  } finally { if (client) client.release(); }
});

// The claim is idempotent and is never counted as an account session start.
router.post('/claim', authenticate, async (req, res) => {
  const { token, title, content, tabFonts } = req.body || {};
  if (!validToken(token) || typeof content !== 'string' || content.length > 2_000_000 ||
      (tabFonts !== undefined && (!Array.isArray(tabFonts) || tabFonts.length > 1000 || tabFonts.some(f => !sessionFonts.has(f))))) {
    return res.status(400).json({ error: 'Invalid writing preview.' });
  }
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const claim = await client.query('SELECT * FROM guest_trial_claims WHERE token_hash = $1 FOR UPDATE', [hashToken(token)]);
    const row = claim.rows[0];
    if (!row || new Date(row.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'This preview can no longer be saved automatically. Your draft is still on this device.' });
    }
    if (row.claimed_by && row.claimed_by !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This preview was already saved to another account.' });
    }
    if (row.claimed_by) {
      await client.query('COMMIT');
      return res.json({ id: row.document_id, alreadyClaimed: true });
    }
    const userRow = await client.query('SELECT data FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    if (!userRow.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Account not found. Your draft remains on this device.' });
    }
    const clean = sanitizeDocumentHtml(content);
    const words = clean.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').trim().split(/\s+/).filter(Boolean).length;
    const now = new Date().toISOString();
    const creditedWords = Math.min(words, 1500);
    const duration = Math.min(1800, Math.floor(creditedWords / 3 * 60), Math.max(0, Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000)));
    const xpEarned = Math.floor(creditedWords * 0.5) + Math.floor(duration / 60) * 2;
    const document = {
      id: row.document_id, userId: req.user.id,
      title: typeof title === 'string' ? title.trim().slice(0, 200) || 'Untitled' : 'Untitled',
      content: clean, tabFonts: tabFonts || [], mode: 'normal', prompt: '',
      wordCount: words, duration, xpEarned, completed: true, completedAt: now, quotaExempt: true,
      guestTrial: true, shareLinks: [], deleted: false, deletedBySystem: false,
      createdAt: new Date(row.started_at).toISOString(), updatedAt: now
    };
    await client.query('INSERT INTO documents (id, data) VALUES ($1, $2)', [document.id, JSON.stringify(document)]);
    if (words) {
      const user = userRow.rows[0].data;
      const today = now.slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const streak = user.lastWritingDate === today ? (user.streak || 0) : user.lastWritingDate === yesterday ? (user.streak || 0) + 1 : 1;
      const thresholds = [0, 1, 3, 5, 8, 11, 14, 17, 20, 23, 27, 30];
      const xp = (user.xp || 0) + xpEarned;
      let level = 0, usedXP = 0, needed = 300;
      while (xp >= usedXP + needed) { usedXP += needed; level++; needed = Math.round(needed * 1.25); }
      const updated = { ...user, xp, level, streak, longestStreak: Math.max(user.longestStreak || 0, streak),
        lastWritingDate: today, treeStage: thresholds.reduce((stage, n, i) => streak >= n ? i : stage, 0),
        totalWords: (user.totalWords || 0) + words, totalSessions: (user.totalSessions || 0) + 1 };
      await client.query('UPDATE users SET data = $2 WHERE id = $1', [req.user.id, JSON.stringify(updated)]);
    }
    await client.query('UPDATE guest_trial_claims SET claimed_by = $2 WHERE token_hash = $1', [hashToken(token), req.user.id]);
    await client.query('COMMIT');
    res.status(201).json({ id: document.id });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Guest trial claim failed:', error);
    res.status(500).json({ error: 'Could not save your preview. Your draft remains on this device.' });
  } finally { if (client) client.release(); }
});

module.exports = router;
