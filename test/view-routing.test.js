const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class MockClassList {
  constructor(classes = []) {
    this.classes = new Set(classes);
  }

  add(name) {
    this.classes.add(name);
  }

  remove(name) {
    this.classes.delete(name);
  }

  contains(name) {
    return this.classes.has(name);
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.contains(name) : force;
    enabled ? this.add(name) : this.remove(name);
    return enabled;
  }
}

function createElement(id, classes = []) {
  const properties = new Map();
  const attributes = new Map();
  return {
    id,
    dataset: {},
    classList: new MockClassList(classes),
    style: {
      setProperty(name, value, priority = '') {
        properties.set(name, { value, priority });
      },
      getPropertyValue(name) {
        return properties.get(name)?.value || '';
      },
      getPropertyPriority(name) {
        return properties.get(name)?.priority || '';
      }
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    getAttribute(name) {
      return attributes.get(name);
    }
  };
}

function loadApp(views, navButtons) {
  const elements = new Map(views.map(view => [view.id, view]));
  const storage = new Map();
  const document = {
    addEventListener() {},
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector(selector) {
      if (selector === '.main-content') return { scrollTop: 0 };
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.view') return views;
      if (selector === '.sidebar-nav-item[data-view]') return navButtons;
      return [];
    }
  };
  const sandbox = {
    console,
    document,
    history: { pushState() {} },
    localStorage: {
      getItem(key) {
        return storage.get(key) || null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      }
    },
    location: { hash: '', pathname: '/app' },
    window: {
      addEventListener() {},
      App: null,
      Stories: null,
      scrollTo() {}
    }
  };
  sandbox.window.location = sandbox.location;
  sandbox.window.history = sandbox.history;

  const appPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
  const source = `${fs.readFileSync(appPath, 'utf8')}\n;globalThis.__testApp = App;`;
  vm.runInNewContext(source, sandbox, { filename: appPath });

  const app = sandbox.__testApp;
  [
    'loadDashboard',
    'loadDocuments',
    'loadLeaderboard',
    'loadProfile',
    'loadMyProfile',
    'loadFriends',
    'loadAnalytics',
    'loadUpgrade'
  ].forEach(method => {
    app[method] = () => {};
  });
  return app;
}

test('switchView hides every inactive view and preserves dashboard flex layout', () => {
  const dashboard = createElement('view-dashboard', ['view', 'claude-dashboard']);
  const documents = createElement('view-documents', ['view', 'claude-sessions']);
  const stories = createElement('view-stories', ['view', 'claude-community']);
  const dashboardNav = createElement('nav-dashboard');
  const documentsNav = createElement('nav-documents');
  const storiesNav = createElement('nav-stories');
  dashboardNav.dataset.view = 'dashboard';
  documentsNav.dataset.view = 'documents';
  storiesNav.dataset.view = 'stories';

  const app = loadApp(
    [dashboard, documents, stories],
    [dashboardNav, documentsNav, storiesNav]
  );

  app.switchView('documents', { fromHash: true });
  assert.equal(dashboard.style.getPropertyValue('display'), 'none');
  assert.equal(dashboard.style.getPropertyPriority('display'), 'important');
  assert.equal(documents.style.getPropertyValue('display'), 'block');
  assert.equal(documents.getAttribute('aria-hidden'), 'false');
  assert.equal(documentsNav.classList.contains('active'), true);

  app.switchView('stories', { fromHash: true });
  assert.equal(documents.style.getPropertyValue('display'), 'none');
  assert.equal(stories.style.getPropertyValue('display'), 'block');
  assert.equal(storiesNav.classList.contains('active'), true);

  app.switchView('dashboard', { fromHash: true });
  assert.equal(stories.style.getPropertyValue('display'), 'none');
  assert.equal(dashboard.style.getPropertyValue('display'), 'flex');
  assert.equal(dashboard.style.getPropertyPriority('display'), 'important');
  assert.equal(dashboardNav.classList.contains('active'), true);
});

test('every primary redesign tab has its own view and the session picker keeps all modes', () => {
  const htmlPath = path.join(__dirname, '..', 'public', 'app.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const primaryViews = ['dashboard', 'documents', 'stories', 'leaderboard', 'friends', 'my-profile', 'settings'];

  for (const view of primaryViews) {
    assert.match(html, new RegExp(`data-view="${view}"`), `${view} nav item is missing`);
    assert.match(html, new RegExp(`id="view-${view}"`), `${view} view is missing`);
  }

  assert.match(html, /id="session-modal"/);
  for (const mode of ['zen', 'normal', 'dangerous', 'research']) {
    assert.match(html, new RegExp(`class="[^"]*mode-option[^"]*" data-mode="${mode}"`), `${mode} mode is missing`);
  }
});
