const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadApp(getSessionQuota) {
  const nodes = new Map();
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, {
      textContent: '',
      classList: { active: false, add() { this.active = true; }, remove() { this.active = false; } },
      focus() {}
    });
    return nodes.get(id);
  };
  const sandbox = {
    console,
    API: { getSessionQuota },
    document: { getElementById: element, addEventListener() {} },
    window: { addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    location: { hash: '', pathname: '/app' },
    history: { pushState() {} },
    setTimeout() { return 1; },
    clearTimeout() {}
  };
  const source = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
  vm.runInNewContext(`${source}\n;globalThis.__app = App;`, sandbox);
  return { app: sandbox.__app, element, sandbox };
}

test('the dashboard count follows the newest quota response and the picker keeps Start Writing', async () => {
  const pending = [];
  const { app, element } = loadApp(() => new Promise(resolve => pending.push(resolve)));
  const first = app.refreshSessionQuota();
  const second = app.refreshSessionQuota();
  pending[1]({ plan: 'free', remaining: 0, resetAt: new Date(Date.now() + 60000).toISOString() });
  await second;
  pending[0]({ plan: 'free', remaining: 2, resetAt: new Date(Date.now() + 60000).toISOString() });
  await first;
  assert.equal(element('dashboard-session-quota').textContent, 'Free · 0/3 sessions left today');
  assert.equal(element('modal-start').textContent, 'Start Writing');
  app.startSession();
  assert.equal(element('daily-limit-modal').classList.active, true);
  assert.equal(element('session-modal').classList.active, false);
  assert.equal(element('daily-limit-stripe-price').textContent, '$1.99/month');
  assert.equal(element('daily-limit-click-price').textContent, '24,990 so\'m/month');
});

test('Click branding and checkout use the configured local payment route', async () => {
  const { app, sandbox } = loadApp(async () => ({ plan: 'free', remaining: 3 }));
  assert.match(app._paymentLogo('click'), /click-logo\.png/);
  const priceRows = app._renderUpgradePriceRows();
  assert.match(priceRows, /alt="Click"/);
  assert.equal((priceRows.match(/upgrade-price-som/g) || []).length, 3);
  assert.doesNotMatch(priceRows, /25,000 so'm|62,000 so'm|112,000 so'm|cheaper|same value/);
  const requests = [];
  sandbox.API.getToken = () => 'test-token';
  sandbox.fetch = async (url, options) => {
    requests.push({ url, options });
    return { json: async () => ({ error: 'not configured' }) };
  };
  app.toast = () => {};
  await app._payWithProvider('click', null, '1m');
  assert.equal(requests[0].url, '/api/click/create');
  assert.equal(JSON.parse(requests[0].options.body).duration, '1m');
});
