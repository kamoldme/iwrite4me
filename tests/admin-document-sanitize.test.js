const test = require('node:test');
const assert = require('node:assert/strict');

test('admin document edits sanitize content before storage and response', async () => {
  const storagePath = require.resolve('../server/utils/storage');
  const authPath = require.resolve('../server/middleware/auth');
  const loggerPath = require.resolve('../server/utils/logger');
  const routerPath = require.resolve('../server/routes/admin');
  const paths = [storagePath, authPath, loggerPath, routerPath];
  const saved = paths.map(path => require.cache[path]);
  let stored;
  let response;
  try {
    require.cache[storagePath] = { exports: {
      findMany() {}, findOne() {}, deleteOne() {}, insertOne() {}, write() {},
      updateOne: async (collection, predicate, updates) => {
        assert.equal(collection, 'documents.json');
        assert.ok(predicate({ id: 'doc-test' }));
        stored = updates;
        return { id: 'doc-test', ...updates };
      },
    } };
    require.cache[authPath] = { exports: { authenticate() {}, requireAdmin() {} } };
    require.cache[loggerPath] = { exports: { logAction() {} } };
    delete require.cache[routerPath];
    const router = require(routerPath);
    const route = router.stack.find(layer => layer.route?.path === '/documents/:id' && layer.route.methods.patch);
    assert.ok(route);
    await route.route.stack[0].handle({
      params: { id: 'doc-test' }, user: { id: 'admin-test' },
      body: { title: 'Edited', content: '<b>Keep</b><img src=x onerror=alert(1)>', deleted: false },
    }, { json(value) { response = value; } });
    assert.equal(stored.content, '<b>Keep</b>');
    assert.equal(response.content, '<b>Keep</b>');
    assert.equal(stored.title, 'Edited');
    assert.equal(stored.deleted, false);
  } finally {
    paths.forEach((path, index) => {
      if (saved[index]) require.cache[path] = saved[index];
      else delete require.cache[path];
    });
  }
});
