const { pool } = require('./storage');

const KINDS = {
  avatar: { urlPath: 'avatars', field: 'avatar' },
  banner: { urlPath: 'banners', field: 'banner' }
};

let tableReady;

function assertKind(kind) {
  if (!KINDS[kind]) throw new Error(`Unsupported profile media kind: ${kind}`);
  return KINDS[kind];
}

function ensureProfileMediaTable() {
  if (!tableReady) {
    tableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS profile_media (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('avatar', 'banner')),
        filename TEXT NOT NULL,
        content BYTEA NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, kind),
        UNIQUE (kind, filename)
      )
    `).catch(err => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

async function getProfileMedia(kind, filename) {
  assertKind(kind);
  await ensureProfileMediaTable();
  const { rows } = await pool.query(
    'SELECT content FROM profile_media WHERE kind = $1 AND filename = $2',
    [kind, filename]
  );
  return rows[0]?.content || null;
}

async function saveProfileMedia(userId, kind, filename, content, updatedAt) {
  const { urlPath, field } = assertKind(kind);
  await ensureProfileMediaTable();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO profile_media (user_id, kind, filename, content)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, kind) DO UPDATE SET
        filename = EXCLUDED.filename,
        content = EXCLUDED.content,
        updated_at = NOW()
    `, [userId, kind, filename, content]);
    const url = `/uploads/${urlPath}/${filename}`;
    const { rows } = await client.query(`
      UPDATE users SET data = jsonb_set(
        jsonb_set(data, '{${field}}', to_jsonb($2::text), true),
        '{${field}UpdatedAt}', to_jsonb($3::bigint), true
      ) WHERE id = $1 RETURNING data
    `, [userId, url, updatedAt]);
    if (!rows.length) throw new Error('User not found');
    await client.query('COMMIT');
    return rows[0].data;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteProfileMedia(userId, kind) {
  const { field } = assertKind(kind);
  await ensureProfileMediaTable();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM profile_media WHERE user_id = $1 AND kind = $2', [userId, kind]);
    const { rows } = await client.query(`
      UPDATE users SET data = jsonb_set(
        jsonb_set(data, '{${field}}', 'null'::jsonb, true),
        '{${field}UpdatedAt}', 'null'::jsonb, true
      ) WHERE id = $1 RETURNING data
    `, [userId]);
    if (!rows.length) throw new Error('User not found');
    await client.query('COMMIT');
    return rows[0].data;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function importLegacyProfileMedia(userId, kind, filename, content) {
  assertKind(kind);
  await ensureProfileMediaTable();
  const result = await pool.query(`
    INSERT INTO profile_media (user_id, kind, filename, content)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, kind) DO NOTHING
  `, [userId, kind, filename, content]);
  return result.rowCount === 1;
}

module.exports = {
  ensureProfileMediaTable,
  getProfileMedia,
  saveProfileMedia,
  deleteProfileMedia,
  importLegacyProfileMedia
};
