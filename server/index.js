require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Don't advertise the framework
app.disable('x-powered-by');

// Real-time streak: returns 0 if lastWritingDate is stale (older than yesterday)
function liveStreak(user) {
  if (!user.lastWritingDate || !user.streak) return 0;
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (user.lastWritingDate === today || user.lastWritingDate === yesterday) return user.streak;
  return 0;
}

// Trust Railway's reverse proxy
app.set('trust proxy', 1);

// Security headers via helmet. CSP allows the third-party services the app
// actually uses: Google (analytics, OAuth, Fonts), Stripe (payments), and
// inline scripts/styles already present across the static HTML pages.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        'https://www.googletagmanager.com',
        'https://www.google-analytics.com',
        'https://accounts.google.com',
        'https://apis.google.com',
        'https://js.stripe.com',
        'https://cdnjs.cloudflare.com'
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      // Background music streams from archive.org (/download/ 302-redirects to ia*.us.archive.org)
      mediaSrc: ["'self'", 'https://archive.org', 'https://*.archive.org', 'blob:'],
      connectSrc: [
        "'self'",
        'https://www.google-analytics.com',
        'https://accounts.google.com',
        'https://api.stripe.com'
      ],
      frameSrc: [
        "'self'",
        'https://accounts.google.com',
        'https://js.stripe.com',
        'https://hooks.stripe.com'
      ],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // Google Sign-In popup postMessages the credential back to window.opener.
  // Helmet's default COOP (same-origin) nulls out window.opener for cross-origin
  // popups, stranding the user on accounts.google.com/gsi/transform.
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CORS — lock to your domain
const allowedOrigins = [
  'https://iwrite4.me',
  'https://www.iwrite4.me',
  'https://write4.me',
  'https://www.write4.me',
  'https://iwrite.up.railway.app'
];
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push('http://localhost:3000', 'http://localhost:5173');
}
// Add Railway staging/public domain
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  allowedOrigins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
}
// Add any Railway-provided URLs
if (process.env.RAILWAY_STATIC_URL) {
  allowedOrigins.push(`https://${process.env.RAILWAY_STATIC_URL}`);
}
app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    // Allow any Railway-assigned domain
    if (allowedOrigins.includes(origin) || /\.up\.railway\.app$/.test(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Rate limiting — tighter buckets per attack surface.
// Login is the most-attacked endpoint, so it gets the strictest cap.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts, please try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: 'Too many accounts created from this IP, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Google OAuth and password change are sensitive but lower-risk than email login.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute
  message: { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false
});

// CRITICAL: Stripe webhook must be registered BEFORE apiLimiter and express.json()
// It needs raw body for signature verification and must not be rate-limited
const { stripeWebhookHandler } = require('./routes/stripe');
app.post('/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhookHandler
);

// Local payment-provider routes (Click; Payme/Atmos to follow). Their server-to-server
// callbacks must bypass the rate limiter — like the Stripe webhook — so they're mounted
// here, before apiLimiter, with their own body parsers (Click posts urlencoded).
app.use('/api/click',
  express.urlencoded({ extended: true }),
  express.json(),
  require('./routes/click')
);
// Payme's JSON-RPC endpoint is also a server-to-server callback — bypass the limiter.
app.use('/api/payme', express.json(), require('./routes/payme'));
// Atmos hosted checkout + its success callback (server-to-server) — bypass the limiter too.
app.use('/api/atmos', express.json(), require('./routes/atmos'));

app.use('/api/auth/register', registerLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/google', authLimiter);
app.use('/api/auth/change-password', authLimiter);
app.use('/api', apiLimiter);

app.use(express.json({ limit: '10mb' }));

// Avatar uploads directory (still file-based)
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const avatarsDir = path.join(dataDir, 'avatars');
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

// Serve avatars dynamically to bypass all caching layers
app.get('/uploads/avatars/:file', (req, res) => {
  const filepath = path.join(avatarsDir, path.basename(req.params.file));
  if (!fs.existsSync(filepath)) return res.status(404).end();
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'image/jpeg');
  res.send(fs.readFileSync(filepath));
});

// Serve announcement images (long-cache since filenames are uuid-stable)
const announcementsDir = path.join(__dirname, 'data/announcements');
if (!fs.existsSync(announcementsDir)) fs.mkdirSync(announcementsDir, { recursive: true });
app.get('/uploads/announcements/:file', (req, res) => {
  const filepath = path.join(announcementsDir, path.basename(req.params.file));
  if (!fs.existsSync(filepath)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Content-Type', 'image/jpeg');
  res.send(fs.readFileSync(filepath));
});
const bannersDir = path.join(dataDir, 'banners');
if (!fs.existsSync(bannersDir)) fs.mkdirSync(bannersDir, { recursive: true });
// Serve banners dynamically to bypass all caching layers
app.get('/uploads/banners/:file', (req, res) => {
  const filepath = path.join(bannersDir, path.basename(req.params.file));
  if (!fs.existsSync(filepath)) return res.status(404).end();
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'image/jpeg');
  res.send(fs.readFileSync(filepath));
});
// Force no-cache on HTML/CSS/JS so deployments are instant
app.use((req, res, next) => {
  const url = req.url.split('?')[0];
  if (url.endsWith('.html') || url === '/' || url === '/app' || url === '/manual-login' || url.startsWith('/story/') || url.startsWith('/app/profile/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  } else if (url.endsWith('.css') || url.endsWith('.js')) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  }
  next();
});
app.use(express.static(path.join(__dirname, '..', 'public')));

// Active users tracker (in-memory, 5-minute window)
const activeUsers = new Map(); // userId → { name, lastSeen }
app.set('activeUsers', activeUsers); // share with routes
app.use('/api', (req, res, next) => {
  if (req.headers.authorization) {
    try {
      const jwt = require('jsonwebtoken');
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'iwrite-dev-secret-change-in-production');
      if (decoded.id) {
            const existing = activeUsers.get(decoded.id);
            if (existing) {
              existing.lastSeen = Date.now();
            } else {
              activeUsers.set(decoded.id, { email: decoded.email, lastSeen: Date.now() });
            }
          }
    } catch {}
  }
  next();
});
// Cleanup stale entries every 60s
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, data] of activeUsers) {
    if (data.lastSeen < cutoff) activeUsers.delete(id);
  }
}, 60000);

// ===== MAINTENANCE MODE (in-memory) =====
const maintenanceState = {
  active: false,
  scheduledAt: null,  // ISO timestamp when maintenance should start
  startedAt: null,    // ISO timestamp when maintenance actually started
  message: 'Platform maintenance in progress. Please save your work.',
  countdownMinutes: 5
};
app.set('maintenanceState', maintenanceState);

// Public endpoint — polled by clients every 10s
app.get('/api/maintenance-status', (req, res) => {
  const ms = app.get('maintenanceState');
  if (!ms.active && !ms.scheduledAt) {
    return res.json({ active: false });
  }
  const now = Date.now();
  // Check if scheduled maintenance should auto-trigger
  if (ms.scheduledAt && !ms.active) {
    const triggerAt = new Date(ms.scheduledAt).getTime() - ms.countdownMinutes * 60 * 1000;
    if (now >= triggerAt) {
      ms.active = true;
      ms.startedAt = new Date().toISOString();
      ms.scheduledAt = null;
    }
  }
  if (!ms.active) {
    return res.json({ active: false, scheduled: ms.scheduledAt });
  }
  const elapsed = Math.floor((now - new Date(ms.startedAt).getTime()) / 1000);
  const countdownTotal = ms.countdownMinutes * 60;
  const remaining = Math.max(countdownTotal - elapsed, 0);
  res.json({
    active: true,
    message: ms.message,
    remaining,        // seconds until shutdown
    shutdownReady: remaining <= 0,
    startedAt: ms.startedAt
  });
});

// Admin endpoint — start/stop/schedule maintenance
app.post('/api/admin/maintenance', (req, res) => {
  // Inline auth check
  const { authenticate, requireAdmin } = require('./middleware/auth');
  authenticate(req, res, () => {
    requireAdmin(req, res, () => {
      const ms = app.get('maintenanceState');
      const { action, scheduledAt, message, countdownMinutes } = req.body;

      if (action === 'start') {
        ms.active = true;
        ms.startedAt = new Date().toISOString();
        ms.scheduledAt = null;
        if (message) ms.message = message;
        if (countdownMinutes) ms.countdownMinutes = countdownMinutes;
        return res.json({ ok: true, state: 'started', startedAt: ms.startedAt });
      }
      if (action === 'schedule') {
        ms.scheduledAt = scheduledAt;
        ms.active = false;
        ms.startedAt = null;
        if (message) ms.message = message;
        if (countdownMinutes) ms.countdownMinutes = countdownMinutes;
        return res.json({ ok: true, state: 'scheduled', scheduledAt: ms.scheduledAt });
      }
      if (action === 'cancel') {
        ms.active = false;
        ms.scheduledAt = null;
        ms.startedAt = null;
        return res.json({ ok: true, state: 'cancelled' });
      }
      res.status(400).json({ error: 'Invalid action. Use start, schedule, or cancel.' });
    });
  });
});

// Health check
app.get('/api/version', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const v = fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim();
    res.json({ version: v });
  } catch (e) {
    res.json({ version: 'unknown' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const { pool } = require('./utils/storage');
    await pool.query('SELECT 1');
    res.json({ status: 'ok', uptime: process.uptime(), activeUsers: activeUsers.size });
  } catch (e) {
    res.status(503).json({ status: 'error', message: 'Database unreachable' });
  }
});

// Active users count (admin only, checked via JWT)
app.get('/api/active-users', (req, res) => {
  const { authenticate, requireAdmin } = require('./middleware/auth');
  authenticate(req, res, () => {
    requireAdmin(req, res, () => {
      const now = Date.now();
      const writingCutoff = now - 60000; // 60s window
      const users = [];
      for (const [id, data] of activeUsers) {
        users.push({
          id,
          email: data.email,
          minutesAgo: Math.round((now - data.lastSeen) / 60000),
          writing: !!(data.writingAt && data.writingAt > writingCutoff),
          onTab: !!(data.focusedAt && data.focusedAt > writingCutoff)
        });
      }
      res.json({ count: users.length, users: users.sort((a, b) => a.minutesAgo - b.minutesAgo) });
    });
  });
});

// Tab visibility ping — frontend posts here whenever document.visibilityState
// flips. Lets the admin distinguish "tab is open" (Online) from "tab is the
// active window" (On Tab). Stays in-memory; resets on server boot like the
// rest of activeUsers state.
app.post('/api/tab-state', express.json(), (req, res) => {
  const { authenticate } = require('./middleware/auth');
  authenticate(req, res, () => {
    const focused = !!req.body?.focused;
    const entry = activeUsers.get(req.user.id);
    if (entry) {
      if (focused) {
        entry.focusedAt = Date.now();
      } else {
        entry.focusedAt = null;
      }
      entry.lastSeen = Date.now();
    } else {
      activeUsers.set(req.user.id, {
        email: req.user.email,
        lastSeen: Date.now(),
        focusedAt: focused ? Date.now() : null
      });
    }
    res.json({ ok: true });
  });
});

// Referral link — serve OG tags for social previews, then redirect browsers
app.get('/join/:code', async (req, res) => {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const isBot = /bot|crawler|spider|preview|telegram|whatsapp|slack|discord|facebook|twitter|linkedin|embedly|quora|pinterest/i.test(ua);

  if (!isBot) {
    return res.redirect(302, `/app?ref=${encodeURIComponent(req.params.code)}`);
  }

  // For bots/crawlers: serve HTML with OG meta for link preview
  const { findOne } = require('./utils/storage');
  const referrer = await findOne('users.json', u => u.referralCode === req.params.code);
  const name = referrer ? (referrer.name || '').split(' ')[0] : 'Someone';
  const streak = referrer ? (referrer.streak || 0) : 0;
  const words = referrer ? (referrer.totalWords || 0) : 0;
  const desc = `${name} invited you to iWrite4.me — a writing tool that keeps you focused. ${words > 0 ? `${words.toLocaleString()} words written${streak > 0 ? `, ${streak}-day streak` : ''}.` : 'If you stop typing, it deletes your work.'}`;
  const origin = `https://${req.get('host') || 'iwrite4.me'}`;

  res.send(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>${name} invited you to iWrite4.me</title>
    <meta property="og:title" content="${name} invited you to iWrite4.me">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="${origin}/og-image.png">
    <meta property="og:url" content="${origin}/join/${req.params.code}">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${name} invited you to iWrite4.me">
    <meta name="twitter:description" content="${desc}">
    <meta name="twitter:image" content="${origin}/og-image.png">
    <meta http-equiv="refresh" content="0;url=/app?ref=${encodeURIComponent(req.params.code)}">
  </head><body></body></html>`);
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/friends', require('./routes/friends'));
app.use('/api/stories', require('./routes/stories'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/share', require('./routes/share'));
app.use('/api/support', require('./routes/support'));
app.use('/api/duels', require('./routes/duels'));
app.use('/api/stripe', require('./routes/stripe').router);
app.use('/api/profiles', require('./routes/profiles'));
app.use('/api/follow', require('./routes/follow'));
app.use('/api/prompts', require('./routes/prompts').router);
app.use('/api/research', require('./routes/research'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/payments', require('./routes/payments'));

const { findOne, findMany, insertOne, updateOne } = require('./utils/storage');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

app.get('/api/auth/google-client-id', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  if (!clientId) {
    return res.status(500).json({ error: 'Google Client ID not configured' });
  }
  res.json({ clientId });
});

app.get('/api/stats/public', async (req, res) => {
  try {
    const users = await findMany('users.json');
    const docs = await findMany('documents.json');
    // Anti-gaming: cap credited time per session (min 3 WPM)
    const MIN_WPM = 3;
    const totalSeconds = docs.reduce((sum, d) => {
      const actualSec = Number(d.duration) || 0;
      const wordCapSec = ((d.wordCount || 0) / MIN_WPM) * 60;
      return sum + Math.min(actualSec, wordCapSec);
    }, 0);
    res.json({
      totalWords: users.reduce((sum, u) => sum + (u.totalWords || 0), 0),
      totalHours: Math.round(totalSeconds / 3600),
      totalWriters: users.filter(u => u.role !== 'admin').length,
      activeNow: activeUsers.size
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const users = await findMany('users.json');
    const docs = await findMany('documents.json');

    // Anti-gaming: cap credited time per session by words written
    // If someone writes 2 words in 30 min, they get ~0.7 min credit, not 30 min
    const MIN_WPM = 3; // very generous floor — even slow writers hit 5-10 WPM
    const effectiveMinutes = (d) => {
      const actualMin = (d.duration || 0) / 60;
      const wordCap = (d.wordCount || 0) / MIN_WPM;
      return Math.min(actualMin, wordCap);
    };

    const all = users
      .filter(u => u.role !== 'admin')
      .map(u => {
        const userDocs = docs.filter(d => d.userId === u.id && !d.deleted && d.duration > 0);
        const minutesWritten = Math.round(userDocs.reduce((sum, d) => sum + effectiveMinutes(d), 0) * 10) / 10;
        return {
          id: u.id,
          name: u.name,
          username: u.username || null,
          totalWords: u.totalWords || 0,
          totalSessions: u.totalSessions || 0,
          xp: u.xp || 0,
          level: u.level || 0,
          streak: liveStreak(u),
          minutesWritten,
          referralCount: u.referralCount || 0,
          avatar: u.avatar || null,
          avatarUpdatedAt: u.avatarUpdatedAt || null,
          plan: u.plan || 'free'
        };
      });

    // Top 10 by streak
    const byStreak = [...all].sort((a, b) => b.streak - a.streak || b.totalWords - a.totalWords).slice(0, 10);
    // Top 10 by time written
    const byTime = [...all].sort((a, b) => b.minutesWritten - a.minutesWritten || b.totalWords - a.totalWords).slice(0, 10);
    // Top 10 by referrals
    const byReferrals = [...all].filter(u => (u.referralCount || 0) > 0).sort((a, b) => b.referralCount - a.referralCount || b.totalWords - a.totalWords).slice(0, 10);

    // Merge all lists (deduplicate by id)
    const seen = new Set();
    const merged = [];
    for (const entry of [...byStreak, ...byTime, ...byReferrals]) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }

    // Sort merged by streak (default), frontend re-sorts per tab
    merged.sort((a, b) => b.streak - a.streak || b.totalWords - a.totalWords);
    const leaderboard = merged.map((entry, i) => ({ rank: i + 1, ...entry }));

    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// Public featured story (no auth required)
// If admin picked one and it's <7 days old, show that.
// Otherwise auto-select the best published story from the last 14 days.
app.get('/api/featured-story', async (req, res) => {
  try {
    const settings = await findMany('app-settings.json');
    const feat = settings.find(s => s.key === 'featured_story');
    let storyId = null;
    let isAutoSelected = false;

    // Check admin pick
    if (feat && feat.storyId) {
      const age = Date.now() - new Date(feat.featuredAt).getTime();
      if (age <= 7 * 24 * 60 * 60 * 1000) {
        storyId = feat.storyId;
      }
    }

    const allStories = await findMany('stories.json');
    const published = allStories.filter(s => s.status === 'published');
    const allLikes = await findMany('story-likes.json');
    const allComments = await findMany('story-comments.json');

    // Auto-select if no valid admin pick
    if (!storyId && published.length > 0) {
      const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const recent = published.filter(s => new Date(s.publishedAt || s.createdAt).getTime() >= twoWeeksAgo);
      const pool = recent.length ? recent : published;

      // Score: likes*3 + comments*2 + views*0.1 + recency bonus
      const scored = pool.map(s => {
        const likes = allLikes.filter(l => l.storyId === s.id).length;
        const comments = allComments.filter(c => c.storyId === s.id).length;
        const daysOld = Math.max(1, (Date.now() - new Date(s.publishedAt || s.createdAt).getTime()) / 86400000);
        const recencyBonus = Math.max(0, 10 - daysOld);
        return { id: s.id, score: likes * 3 + comments * 2 + (s.viewCount || 0) * 0.1 + recencyBonus };
      });
      scored.sort((a, b) => b.score - a.score);
      storyId = scored[0].id;
      isAutoSelected = true;
    }

    if (!storyId) return res.json({ featured: null });

    const story = published.find(s => s.id === storyId);
    if (!story) return res.json({ featured: null });

    const users = await findMany('users.json');
    const author = users.find(u => u.id === story.userId);
    const likes = allLikes.filter(l => l.storyId === story.id);

    res.json({
      featured: {
        storyId: story.id,
        title: story.title,
        excerpt: story.excerpt || (story.content || '').replace(/<[^>]*>/g, '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').slice(0, 200),
        readTimeMinutes: story.readTimeMinutes || 1,
        authorName: author ? author.name : 'Unknown',
        authorUsername: author ? (author.username || null) : null,
        authorAvatar: author ? (author.avatar || null) : null,
        authorAvatarUpdatedAt: author ? (author.avatarUpdatedAt || null) : null,
        authorPlan: author ? (author.plan || 'free') : 'free',
        likeCount: likes.length,
        viewCount: story.viewCount || 0,
        featuredAt: feat ? feat.featuredAt : null,
        autoSelected: isAutoSelected
      }
    });
  } catch (err) {
    console.error('Public featured story error:', err);
    res.json({ featured: null });
  }
});

// Simple analytics endpoint
app.post('/api/analytics/pageview', (req, res) => {
  // Fire-and-forget — non-critical
  const { page } = req.body;
  insertOne('logs.json', {
    id: uuid(),
    action: 'pageview',
    userId: null,
    details: { page, ua: req.headers['user-agent'] },
    timestamp: new Date().toISOString()
  }).catch(() => {});
  res.json({ ok: true });
});

// One-time migration endpoint — reads JSON files from Railway volume and inserts into PostgreSQL
app.post('/api/migrate-volume', async (req, res) => {
  const secret = req.headers['x-migrate-secret'];
  if (secret !== process.env.JWT_SECRET) return res.status(403).json({ error: 'Forbidden' });

  const { pool } = require('./utils/storage');
  const dataDir = path.join(__dirname, 'data');
  const files = {
    'users.json': 'users',
    'documents.json': 'documents',
    'comments.json': 'comments',
    'duels.json': 'duels',
    'activities.json': 'activities',
    'logs.json': 'logs',
    'support.json': 'support'
  };

  const results = {};
  for (const [filename, table] of Object.entries(files)) {
    const filepath = path.join(dataDir, filename);
    if (!fs.existsSync(filepath)) { results[filename] = 'not found'; continue; }
    try {
      const records = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      if (!Array.isArray(records)) { results[filename] = 'not an array'; continue; }
      let inserted = 0, skipped = 0;
      for (const record of records) {
        if (!record.id) { skipped++; continue; }
        try {
          await pool.query(
            `INSERT INTO ${table} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
            [record.id, JSON.stringify(record)]
          );
          inserted++;
        } catch { skipped++; }
      }
      results[filename] = `${inserted} upserted, ${skipped} skipped (of ${records.length})`;
    } catch (e) { results[filename] = `error: ${e.message}`; }
  }
  res.json({ results });
});

// HTML routes
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'app.html'));
});
app.get('/manual-login', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});
app.get('/shared/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'shared.html'));
});
app.get('/story/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'story.html'));
});
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'privacy.html'));
});
app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'terms.html'));
});

/// Public user lookup by username (for invite popup)
app.get('/api/users/lookup/:username', async (req, res) => {
  try {
    const { findOne } = require('./utils/storage');
    const user = await findOne('users.json', u => u.username && u.username.toLowerCase() === req.params.username.toLowerCase());
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ name: user.name, username: user.username });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// Shared OG tag renderer for profile pages (used by /profile/ and /u/)
// HTML-escapes user data to prevent XSS in meta tags
function escapeOG(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
async function renderProfileOG(username, host) {
  const { findOne } = require('./utils/storage');
  const user = await findOne('users.json', u => u.username && u.username.toLowerCase() === username.toLowerCase());
  const name = escapeOG(user ? (user.name || username) : username);
  const bio = user ? (user.bio || '') : '';
  const words = user ? (user.totalWords || 0) : 0;
  const level = user ? (user.level || 1) : 1;
  const streak = user ? liveStreak(user) : 0;
  const sessions = user ? (user.totalSessions || 0) : 0;
  const isPro = user && user.plan === 'premium';
  const rawDesc = bio || `${user ? (user.name || username) : username}${isPro ? ' (PRO)' : ''} on iWrite4.me — ${words > 0 ? `${words.toLocaleString()} words written · Level ${level}${streak > 0 ? ` · ${streak}-day streak` : ''} · ${sessions} sessions.` : 'Writer on iWrite4.me'}`;
  const desc = escapeOG(rawDesc);
  const origin = `https://${host || 'iwrite4.me'}`;
  const ogImage = user ? `${origin}/api/profiles/${encodeURIComponent(username)}/og-image` : `${origin}/og-image.png`;
  const canonicalUrl = `${origin}/app/profile/${encodeURIComponent(username)}`;

  return `<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>${name} — iWrite4.me</title>
    <meta property="og:title" content="${name} — iWrite4.me">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:url" content="${canonicalUrl}">
    <meta property="og:type" content="profile">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${name} — iWrite4.me">
    <meta name="twitter:description" content="${desc}">
    <meta name="twitter:image" content="${ogImage}">
    <meta http-equiv="refresh" content="0;url=/app/profile/${encodeURIComponent(username)}">
  </head><body></body></html>`;
}

const isBot = (ua) => /bot|crawler|spider|preview|telegram|whatsapp|slack|discord|facebook|twitter|linkedin|embedly|quora|pinterest/i.test((ua || '').toLowerCase());

// Canonical profile URL: /app/profile/:username → OG tags for bots, SPA for humans
app.get('/app/profile/:username', async (req, res) => {
  if (isBot(req.headers['user-agent'])) {
    return res.send(await renderProfileOG(req.params.username, req.get('host')));
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'app.html'));
});

// Legacy profile URL: /profile/:username → redirect to /app/profile/:username
app.get('/profile/:username', async (req, res) => {
  const username = req.params.username;
  if (isBot(req.headers['user-agent'])) {
    return res.send(await renderProfileOG(username, req.get('host')));
  }
  res.redirect(302, `/app/profile/${encodeURIComponent(username)}`);
});

// Legacy profile URL: /u/:username → redirect to /app/profile/:username
app.get('/u/:username', async (req, res) => {
  const username = req.params.username;
  if (!isBot(req.headers['user-agent'])) {
    return res.redirect(302, `/app/profile/${encodeURIComponent(username)}`);
  }
  res.send(await renderProfileOG(username, req.get('host')));
});

// Invite route: /invite/:username → OG tags for bots, redirect for browsers
app.get('/invite/:username', async (req, res) => {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const isBot = /bot|crawler|spider|preview|telegram|whatsapp|slack|discord|facebook|twitter|linkedin|embedly|quora|pinterest/i.test(ua);
  const username = req.params.username;

  if (!isBot) {
    return res.redirect(302, `/app?invite=${encodeURIComponent(username)}&view=friends`);
  }

  // For bots/crawlers: serve HTML with OG meta for link preview
  const { findOne } = require('./utils/storage');
  const user = await findOne('users.json', u => u.username && u.username.toLowerCase() === username.toLowerCase());
  const name = user ? (user.name || username) : username;
  const streak = user ? liveStreak(user) : 0;
  const words = user ? (user.totalWords || 0) : 0;
  const level = user ? (user.level || 1) : 1;
  const sessions = user ? (user.totalSessions || 0) : 0;
  const desc = `${name} wants to be your writing buddy on iWrite4.me! ${words > 0 ? `${words.toLocaleString()} words written · Level ${level}${streak > 0 ? ` · ${streak}-day streak` : ''} · ${sessions} sessions.` : 'A distraction-free writing tool — if you stop typing, it deletes your work.'}`;
  const origin = `https://${req.get('host') || 'iwrite4.me'}`;

  res.send(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>Write with ${name} on iWrite4.me</title>
    <meta property="og:title" content="Write with ${name} on iWrite4.me">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="${origin}/og-image.png">
    <meta property="og:url" content="${origin}/invite/${encodeURIComponent(username)}">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Write with ${name} on iWrite4.me">
    <meta name="twitter:description" content="${desc}">
    <meta name="twitter:image" content="${origin}/og-image.png">
    <meta http-equiv="refresh" content="0;url=/app?invite=${encodeURIComponent(username)}&view=friends">
  </head><body></body></html>`);
});

// 404 catch-all — must be after all other routes
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

// Initialize database and start
const { initDB } = require('./utils/storage');
const { seedPromptsIfEmpty } = require('./utils/seedPrompts');

async function start() {
  // Seed admin account
  try {
    await initDB();
    await seedPromptsIfEmpty();
    const adminPass = process.env.ADMIN_PASSWORD || 'Admin1234';
    const admin = await findOne('users.json', u => u.email === 'admin@iwrite4.me');
    if (!admin) {
      const hash = await bcrypt.hash(adminPass, 12);
      await insertOne('users.json', {
        id: uuid(),
        name: 'Admin',
        email: 'admin@iwrite4.me',
        password: hash,
        role: 'admin',
        plan: 'free',
        xp: 0, level: 0, streak: 0, longestStreak: 0,
        lastWritingDate: null, treeStage: 0, totalWords: 0, totalSessions: 0,
        achievements: [], friends: [], friendRequests: [], sentRequests: [], sharedTokens: [],
        createdAt: new Date().toISOString()
      });
      console.log('Admin account seeded');
    } else {
      // Always sync admin password with env/default on startup
      const hash = await bcrypt.hash(adminPass, 12);
      await updateOne('users.json', u => u.email === 'admin@iwrite4.me', { password: hash, role: 'admin' });
      console.log('Admin password synced');
    }

    // Migrate: assign random usernames to existing users without one
    const allUsers = await findMany('users.json');
    const adjectives = ['swift', 'bright', 'quiet', 'bold', 'keen', 'wild', 'calm', 'warm', 'cool', 'free'];
    const nouns = ['writer', 'scribe', 'author', 'poet', 'muse', 'quill', 'ink', 'page', 'story', 'word'];
    let migrated = 0;
    for (const u of allUsers) {
      if (!u.username) {
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const num = Math.floor(Math.random() * 9999);
        await updateOne('users.json', usr => usr.id === u.id, { username: `${adj}_${noun}_${num}` });
        migrated++;
      }
    }
    if (migrated > 0) console.log(`Assigned random usernames to ${migrated} existing users`);

    // One-time cleanup: clear stripeSubscriptionId on free users.
    // Stale links from cancelled trials caused phantom "Subscription Renewed"
    // Telegram pings when Stripe replayed events for those dead subs.
    let cleared = 0;
    for (const u of allUsers) {
      if (u.plan !== 'premium' && u.stripeSubscriptionId) {
        await updateOne('users.json', usr => usr.id === u.id, { stripeSubscriptionId: null });
        cleared++;
      }
    }
    if (cleared > 0) console.log(`Cleared stale stripeSubscriptionId on ${cleared} free user(s)`);
  } catch (e) {
    console.error('DB init error:', e.message || e);
    console.error('DATABASE_URL set:', !!process.env.DATABASE_URL);
    console.error('Full error:', e);
    process.exit(1);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`iWrite4.me running on port ${PORT}`);
    // Start Telegram bot (non-blocking, won't crash server if it fails)
    // Pass activeUsers map directly to avoid circular require
    try { require('./telegram').init(activeUsers); } catch (e) { console.error('[Telegram] Init failed:', e.message); }

    // One-time reconciliation: restore users whose Stripe sub is still active
    // but were silently downgraded (missed renewal webhook + sweep collision).
    // Must run BEFORE the sweep so restored users aren't immediately re-downgraded.
    const { reconcileStripeSubscriptions } = require('./routes/stripe');
    const { sweepExpiredSubscriptions } = require('./middleware/auth');
    (async () => {
      await reconcileStripeSubscriptions();
      await sweepExpiredSubscriptions();
    })();
    setInterval(sweepExpiredSubscriptions, 60 * 60 * 1000);
  });
}

start();

module.exports = app;
