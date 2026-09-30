const { pool } = require('../utils/storage');

const FREE_DAILY_LIMIT = 3;

function quotaDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function resetAt(now = new Date()) {
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return tomorrow.toISOString();
}

function effectivePlan(user, now = new Date()) {
  const expiry = user.planExpiresAt;
  const active = !expiry || expiry === 'infinite' || new Date(expiry) > now;
  return user.plan === 'premium' && active ? 'premium' : 'free';
}

function quotaPayload(user, used, now = new Date()) {
  const plan = effectivePlan(user, now);
  return {
    plan,
    limit: plan === 'premium' ? null : FREE_DAILY_LIMIT,
    used,
    remaining: plan === 'premium' ? null : Math.max(0, FREE_DAILY_LIMIT - used),
    resetAt: resetAt(now)
  };
}

async function existingStarts(client, userId, day) {
  const { rows } = await client.query(`
    SELECT COUNT(*)::integer AS used FROM documents
    WHERE data->>'userId' = $1
      AND data->>'createdAt' >= $2
      AND data->>'createdAt' < $3
      AND COALESCE((data->>'quotaExempt')::boolean, false) = false
  `, [userId, `${day}T00:00:00.000Z`, resetAt(new Date(`${day}T00:00:00.000Z`))]);
  return rows[0].used;
}

async function ensureUsageRow(client, userId, day) {
  // Seed from sessions started earlier today, before this feature was deployed.
  const initialUsed = await existingStarts(client, userId, day);
  await client.query(`
    INSERT INTO session_daily_usage (user_id, day, used)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, day) DO NOTHING
  `, [userId, day, initialUsed]);
  const { rows } = await client.query(
    'SELECT used FROM session_daily_usage WHERE user_id = $1 AND day = $2 FOR UPDATE',
    [userId, day]
  );
  return rows[0].used;
}

async function getSessionQuota(userId, now = new Date()) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT data FROM users WHERE id = $1', [userId]);
    if (!rows.length) return null;
    const day = quotaDay(now);
    const usage = await client.query('SELECT used FROM session_daily_usage WHERE user_id = $1 AND day = $2', [userId, day]);
    const used = usage.rows.length ? usage.rows[0].used : await existingStarts(client, userId, day);
    return quotaPayload(rows[0].data, used, now);
  } finally {
    client.release();
  }
}

async function createSessionDocument(userId, buildDocument, requestId, maintenanceBypass) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query('SELECT data FROM users WHERE id = $1', [userId]);
    if (!userResult.rows.length) {
      await client.query('ROLLBACK');
      return { missingUser: true };
    }
    const now = new Date();
    const day = quotaDay(now);
    const used = await ensureUsageRow(client, userId, day);
    const user = userResult.rows[0].data;
    const quota = quotaPayload(user, used, now);

    if (requestId) {
      const prior = await client.query(`
        SELECT data FROM documents WHERE data->>'userId' = $1 AND data->>'clientRequestId' = $2 LIMIT 1
      `, [userId, requestId]);
      if (prior.rows.length) {
        await client.query('COMMIT');
        return { document: prior.rows[0].data, quota };
      }
    }

    if (!maintenanceBypass && quota.remaining === 0) {
      await client.query('COMMIT');
      return { limited: true, quota };
    }

    const document = await buildDocument(client, now);
    document.clientRequestId = requestId || null;
    document.quotaExempt = !!maintenanceBypass;
    await client.query('INSERT INTO documents (id, data) VALUES ($1, $2)', [document.id, JSON.stringify(document)]);
    if (!maintenanceBypass) {
      await client.query('UPDATE session_daily_usage SET used = used + 1 WHERE user_id = $1 AND day = $2', [userId, day]);
    }
    await client.query('COMMIT');
    return { document, quota: quotaPayload(user, used + (maintenanceBypass ? 0 : 1), now) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { FREE_DAILY_LIMIT, quotaDay, resetAt, effectivePlan, quotaPayload, getSessionQuota, createSessionDocument };
