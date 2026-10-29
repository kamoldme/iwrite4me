const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

test('profile images are stored in PostgreSQL and replace/delete atomically', { skip: !process.env.PROFILE_MEDIA_TEST_DATABASE_URL }, async () => {
  const { Pool } = require('pg');
  const connectionString = process.env.PROFILE_MEDIA_TEST_DATABASE_URL;
  const schema = 'profile_media_test_' + randomUUID().replaceAll('-', '');
  const setup = new Pool({ connectionString });
  await setup.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(connectionString);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { pool, initDB } = require('../server/utils/storage');
  const { getProfileMedia, saveProfileMedia, deleteProfileMedia, importLegacyProfileMedia } = require('../server/utils/profile-media');

  try {
    await initDB();
    const id = randomUUID();
    await pool.query('INSERT INTO users (id, data) VALUES ($1, $2)', [id, { id, name: 'Writer' }]);
    const firstAvatar = Buffer.from('first avatar');
    const secondAvatar = Buffer.from('second avatar');
    const banner = Buffer.from('banner');

    let user = await saveProfileMedia(id, 'avatar', `${id}.jpg`, firstAvatar, 100);
    assert.equal(user.avatar, `/uploads/avatars/${id}.jpg`);
    assert.equal(user.avatarUpdatedAt, 100);
    assert.deepEqual(await getProfileMedia('avatar', `${id}.jpg`), firstAvatar);

    user = await saveProfileMedia(id, 'avatar', `${id}.jpg`, secondAvatar, 200);
    assert.equal(user.avatarUpdatedAt, 200);
    assert.deepEqual(await getProfileMedia('avatar', `${id}.jpg`), secondAvatar);

    user = await saveProfileMedia(id, 'banner', `${id}-300.jpg`, banner, 300);
    assert.equal(user.banner, `/uploads/banners/${id}-300.jpg`);
    assert.deepEqual(await getProfileMedia('banner', `${id}-300.jpg`), banner);

    assert.equal(await importLegacyProfileMedia(id, 'avatar', `${id}.jpg`, firstAvatar), false);
    assert.deepEqual(await getProfileMedia('avatar', `${id}.jpg`), secondAvatar);

    user = await deleteProfileMedia(id, 'avatar');
    assert.equal(user.avatar, null);
    assert.equal(user.avatarUpdatedAt, null);
    assert.equal(await getProfileMedia('avatar', `${id}.jpg`), null);
    assert.deepEqual(await getProfileMedia('banner', `${id}-300.jpg`), banner);

    await assert.rejects(saveProfileMedia(randomUUID(), 'avatar', `${randomUUID()}.jpg`, firstAvatar, 400));
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM profile_media')).rows[0].count, 1);
  } finally {
    await pool.end();
    await setup.query(`DROP SCHEMA ${schema} CASCADE`);
    await setup.end();
  }
});
