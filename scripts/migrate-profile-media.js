// One-time import of profile images referenced by users into durable PostgreSQL storage.
// Files without a current user reference are intentionally ignored.
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/utils/storage');
const { ensureProfileMediaTable, importLegacyProfileMedia } = require('../server/utils/profile-media');

const dataDir = process.env.PROFILE_MEDIA_LEGACY_DIR || path.join(__dirname, '../server/data');

async function main() {
  await ensureProfileMediaTable();
  const { rows } = await pool.query('SELECT id, data FROM users');
  const counts = { imported: 0, alreadyStored: 0, missing: 0 };

  for (const { id, data } of rows) {
    for (const [kind, folder] of [['avatar', 'avatars'], ['banner', 'banners']]) {
      const url = data[kind];
      if (typeof url !== 'string' || !url.startsWith(`/uploads/${folder}/`)) continue;
      const filename = path.basename(url);
      const filepath = path.join(dataDir, folder, filename);
      if (!fs.existsSync(filepath)) {
        counts.missing++;
        continue;
      }
      const content = fs.readFileSync(filepath);
      if (await importLegacyProfileMedia(id, kind, filename, content)) counts.imported++;
      else counts.alreadyStored++;
    }
  }

  console.log(JSON.stringify(counts));
}

main().catch(err => {
  console.error('Profile media import failed:', err);
  process.exitCode = 1;
}).finally(() => pool.end());
