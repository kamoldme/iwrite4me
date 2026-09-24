const { pool } = require('./storage');
const DAY = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(status, message) { return Object.assign(new Error(message), { status }); }
function validate(rating, comment = '') {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw fail(400, 'Choose a rating from 1 to 5.');
  if (typeof comment !== 'string' || comment.length > 1000) throw fail(400, 'Comments must be at most 1,000 characters.');
  return comment.trim();
}
async function recordFeedback(userId, documentId, input = null, now = Date.now()) {
  if (!UUID.test(documentId || '')) throw fail(400, 'Invalid session.');
  const comment = input ? validate(input.rating, input.comment) : '';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO feedback_state (id, data) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, '{}']);
    const state = (await client.query('SELECT data FROM feedback_state WHERE id = $1 FOR UPDATE', [userId])).rows[0].data;
    const doc = (await client.query('SELECT data FROM documents WHERE id = $1', [documentId])).rows[0]?.data;
    if (!doc || doc.userId !== userId) throw fail(404, 'Session not found.');
    const existing = (await client.query('SELECT data FROM session_feedback WHERE id = $1', [documentId])).rows[0]?.data;
    if (existing) {
      await client.query('COMMIT');
      return { eligible: false, duplicate: true, nextPromptAt: state.nextPromptAt };
    }
    const age = now - Date.parse(doc.completedAt);
    if (!doc.completed || doc.deleted || doc.deactivatedByAdmin || !(doc.wordCount > 0) || !Number.isFinite(age) || age < 0 || age > DAY) {
      throw fail(409, 'Feedback is available only just after a completed session.');
    }
    if (!input && Date.parse(state.nextPromptAt) > now) {
      await client.query('COMMIT');
      return { eligible: false, nextPromptAt: state.nextPromptAt };
    }
    if (input && (state.documentId !== documentId || !(Date.parse(state.nextPromptAt) > now))) {
      throw fail(409, 'This feedback invitation has expired.');
    }
    const nextPromptAt = new Date(now + (input ? 30 : 7) * DAY).toISOString();
    let feedback;
    if (input) {
      feedback = { id: documentId, userId, documentId, rating: input.rating, comment, mode: doc.mode,
        wordCount: doc.wordCount, duration: doc.duration, createdAt: new Date(now).toISOString() };
      await client.query('INSERT INTO session_feedback (id, data) VALUES ($1, $2)', [documentId, JSON.stringify(feedback)]);
    }
    await client.query('UPDATE feedback_state SET data = $2 WHERE id = $1', [userId, JSON.stringify({ documentId, nextPromptAt })]);
    await client.query('COMMIT');
    return { eligible: !input, nextPromptAt, feedback };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}
module.exports = { recordFeedback, validate, DAY };
