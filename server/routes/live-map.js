const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { createTracker, cloudflareVisitor } = require('../utils/live-map');
const tracker = createTracker();
const router = express.Router();
router.use(rateLimit({
  windowMs: 60000, limit: 60, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => {
    const source = cloudflareVisitor(req);
    return source ? tracker.key(source.address, '') : ipKeyGenerator(req.ip);
  }
}));
router.post('/heartbeat', (req, res) => {
  const origin = req.get('origin');
  let sameOrigin = false;
  try { sameOrigin = !!origin && new URL(origin).host === req.get('host'); } catch {}
  if (!sameOrigin) return res.status(403).json({ error: 'Same-origin requests only' });
  const located = tracker.record(cloudflareVisitor(req), req.get('user-agent'));
  res.set('Cache-Control', 'no-store').json({ ok: true, located });
});
router.get('/', (req, res) => {
  res.set('Cache-Control', 'public, max-age=10, s-maxage=10').json(tracker.snapshot());
});
module.exports = router;
