const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { findOne } = require('../utils/storage');
const { recordFeedback } = require('../utils/feedback');
router.use(authenticate);
router.post('/:documentId/prompt', async (req, res, next) => {
  try { res.json(await recordFeedback(req.user.id, req.params.documentId)); }
  catch (err) { if (err.status) return res.status(err.status).json({ error: err.message }); next(err); }
});
router.post('/:documentId', async (req, res, next) => {
  try {
    const result = await recordFeedback(req.user.id, req.params.documentId, req.body || {});
    if (result.feedback) {
      try {
        const user = await findOne('users.json', u => u.id === req.user.id);
        require('../telegram').notifySessionFeedback(user || {}, result.feedback);
      } catch (err) { console.error('[Feedback] Telegram notification failed:', err.message); }
    }
    res.status(result.duplicate ? 200 : 201).json({ ok: true, nextPromptAt: result.nextPromptAt });
  } catch (err) { if (err.status) return res.status(err.status).json({ error: err.message }); next(err); }
});
module.exports = router;
