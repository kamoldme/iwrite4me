/* Staging page formats. Move existing controls; keep their IDs and App handlers. */
(() => {
  if (!document.body.classList.contains('glow-dashboard')) return;
  const $ = id => document.getElementById(id);
  const make = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls; if (text) n.textContent = text; return n; };
  const box = (cls, nodes, tag = 'div') => { const n = make(tag, cls); n.append(...nodes.filter(Boolean)); return n; };
  function tabPanels(items, label, vertical = false) {
    const nav = make('div', 'workspace-tabs'); nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', label);
    if (vertical) nav.setAttribute('aria-orientation', 'vertical');
    const show = key => items.forEach(item => {
      const selected = key === item.key; item.panel.hidden = !selected;
      item.button.setAttribute('aria-selected', String(selected)); item.button.tabIndex = selected ? 0 : -1;
    });
    items.forEach(item => {
      item.button = make('button', 'workspace-tab', item.label); item.button.type = 'button';
      item.button.id = `${item.panel.id}-tab`; item.button.setAttribute('role', 'tab'); item.button.setAttribute('aria-controls', item.panel.id);
      item.panel.setAttribute('role', 'tabpanel'); item.panel.setAttribute('aria-labelledby', item.button.id);
      item.button.addEventListener('click', () => show(item.key)); nav.append(item.button);
    });
    nav.addEventListener('keydown', e => {
      const index = items.findIndex(item => item.button === e.target); if (index < 0) return;
      let next;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = items.length - 1;
      if (e.key === 'ArrowRight' || (vertical && e.key === 'ArrowDown')) next = (index + 1) % items.length;
      if (e.key === 'ArrowLeft' || (vertical && e.key === 'ArrowUp')) next = (index - 1 + items.length) % items.length;
      if (next !== undefined) { e.preventDefault(); show(items[next].key); items[next].button.focus(); }
    });
    show(items[0].key); return { nav, show };
  }
  function library() {
    const view = $('view-documents'); view.classList.add('workspace-v2', 'workspace-library');
    const header = view.querySelector('.docs-header');
    const rail = make('aside', 'workspace-library-rail'); rail.setAttribute('aria-label', 'Browse sessions');
    const folderIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>';
    const folderAdd = $('create-folder-btn');
    const folderList = $('folder-list');
    folderList.setAttribute('aria-label', 'Your folders');
    folderList.setAttribute('role', 'group');
    folderAdd.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
    folderAdd.setAttribute('aria-label', 'Create folder (Pro)');
    rail.append(make('h2', '', 'Your library'), $('docs-filter-pills'), box('workspace-folder-heading', [box('workspace-folder-label', [], 'span'), folderAdd]), folderList, make('p', 'workspace-folder-hint', 'Create folders with Pro to organise your writing.'));
    rail.querySelector('.workspace-folder-label').innerHTML = folderIcon + '<span>Folders</span>';
    rail.querySelector('h2').innerHTML = folderIcon + '<span>Your library</span>';
    const tools = box('workspace-library-tools', [view.querySelector('.session-search-wrap')]);
    const toggle = make('div', 'workspace-view-toggle'); toggle.setAttribute('role', 'group'); toggle.setAttribute('aria-label', 'Session layout');
    const displayButtons = ['grid', 'list'].map(type => {
      const b = make('button', '', type === 'grid' ? 'Cards' : 'List'); b.type = 'button';
      b.dataset.libraryLayout = type; b.addEventListener('click', () => setLayout(type)); toggle.append(b); return b;
    });
    function setLayout(type) {
      view.dataset.libraryLayout = type; localStorage.setItem('iwrite_library_layout', type);
      displayButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.libraryLayout === type)));
    }
    setLayout(localStorage.getItem('iwrite_library_layout') === 'list' ? 'list' : 'grid');
    const history = $('history-btn'); history.querySelector('svg').innerHTML = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'; history.append(make('span', '', 'History')); history.setAttribute('aria-label', 'Session history');
    tools.append(box('workspace-library-tools-actions', [toggle, history]));
    const content = box('workspace-library-main', [tools, $('folder-back-btn'), $('folder-breadcrumb'), $('all-docs'), $('shared-docs-section')]);
    view.append(box('workspace-library-layout', [rail, content]));
    header.querySelector('h1').textContent = 'Your sessions';
    $('all-docs').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('.doc-card[data-id]:not(.doc-failed)')) { e.preventDefault(); App.openDocument(e.target.dataset.id); }
    });
    const enhanceCards = () => $('all-docs').querySelectorAll('.doc-card:not(.doc-failed)').forEach(card => {
      card.tabIndex = 0; card.setAttribute('role', 'link');
      card.setAttribute('aria-label', `Open ${card.querySelector('h4')?.textContent.trim() || 'document'}`);
    });
    new MutationObserver(enhanceCards).observe($('all-docs'), { childList: true }); enhanceCards();
  }
  function community() {
    const view = $('view-stories'); view.classList.add('workspace-v2');
    view.querySelector('.community-hero h1').textContent = 'A community of writers';
    view.querySelector('.community-hero-actions').append($('new-story-btn'));
    const panel = view.querySelector('.stories-feed-panel'); panel.append(view.querySelector('.stories-rail'));
    // Articles remain the first reading and keyboard destination.
    const feed = $('stories-feed');
    const enhanceArticles = () => feed.querySelectorAll('.story-feed-item,.story-hero-card').forEach(card => {
      card.tabIndex = 0; card.setAttribute('role', 'link');
      card.setAttribute('aria-label', `Read ${card.querySelector('h3')?.textContent || 'story'}`);
    });
    feed.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('.story-feed-item,.story-hero-card')) { e.preventDefault(); e.target.click(); }
    });
    new MutationObserver(enhanceArticles).observe(feed, { childList: true, subtree: true }); enhanceArticles();
    // Missing stored photos get a local presentation fallback; profile data stays intact.
    const boundAvatars = new WeakSet();
    const enhanceAvatars = () => view.querySelectorAll('img.stories-popular-avatar,img.story-author-avatar-img').forEach(img => {
      if (boundAvatars.has(img)) return;
      boundAvatars.add(img);
      const fallback = () => {
        if (!img.isConnected) return;
        const name = img.closest('.stories-popular-item')?.querySelector('.stories-popular-name')?.textContent || img.alt || 'Writer';
        const initials = name.trim().split(/\s+/u).slice(0, 2).map(part => [...part][0] || '').join('').toUpperCase();
        const replacement = make('span', img.matches('.stories-popular-avatar') ? 'stories-popular-avatar community-avatar-fallback' : 'story-author-avatar-fallback', initials);
        replacement.setAttribute('aria-hidden', 'true');
        img.replaceWith(replacement);
      };
      img.addEventListener('error', fallback, { once: true });
      if (img.complete && !img.naturalWidth) fallback();
    });
    new MutationObserver(enhanceAvatars).observe(view, { childList: true, subtree: true }); enhanceAvatars();
    const sort = $('stories-feed-sort-row');
    const syncTab = () => { view.dataset.communityTab = sort.style.display === 'none' ? 'mine' : 'feed'; };
    new MutationObserver(syncTab).observe(sort, { attributes: true, attributeFilter: ['style'] }); syncTab();
  }
  function leaderboard() {
    const view = $('view-leaderboard'); view.classList.add('workspace-v2');
    const rail = $('leaderboard-rail'), card = rail.querySelector('.lb-rail-card');
    const rankRow = card.querySelector('.lb-rail-rank-row');
    rankRow.append($('lb-your-note'));
    const personal = box('workspace-rank-personal', [card.querySelector('.lb-rail-kicker'), rankRow]);
    const details = box('workspace-rank-details', [$('lb-rail-breakdown'), card.querySelector('.lb-rail-static-note')]);
    card.replaceChildren(personal, details); view.insertBefore(rail, $('lb-tabs'));
    view.querySelector('.leaderboard-layout').classList.add('workspace-standings');
  }
  function friends() {
    const view = $('view-friends'); view.classList.add('workspace-v2');
    const left = view.querySelector('.friends-left'), activity = view.querySelector('.friends-right');
    left.id = 'workspace-friends-directory'; activity.id = 'workspace-friends-activity';
    left.classList.add('workspace-panel'); activity.classList.add('workspace-panel');
    left.prepend(make('h2', 'friends-panel-title', 'Friends and requests'));
    view.querySelector('.friends-header').append($('friends-add-toggle-btn'));
    const body = view.querySelector('.friends-split-layout'); body.replaceChildren(left, activity);
    view.append($('friends-add-row'), box('workspace-friends-layout', [body]));
    const syncEmpty = () => {
      const p = $('friends-list').querySelector('.empty-state p');
      if (p?.textContent.includes('by their email above')) p.innerHTML = '<strong>No friends yet</strong><span>Use Add a friend at the top right to connect with another writer.</span>';
    };
    new MutationObserver(syncEmpty).observe($('friends-list'), { childList: true, subtree: true, characterData: true }); syncEmpty();
  }
  function profile(id, prefix) {
    const view = $(id); view.classList.add('workspace-v2', 'workspace-profile');
    const header = view.querySelector('.up-header');
    const identity = box('workspace-profile-identity', [$(prefix + '-avatar'), header.querySelector('.up-header-info'), header.querySelector('.up-actions'), $(prefix + '-stats')], 'aside');
    const content = box('workspace-profile-main', [view.querySelector('.up-tabs'), view.querySelector('.up-tab-content')]);
    header.remove(); view.append(box('workspace-profile-layout', [identity, content]));
  }
  function settings() {
    const view = $('view-settings'); view.classList.add('workspace-v2');
    const oldLayout = view.querySelector('.settings-layout');
    const sections = [...view.querySelectorAll('.profile-section')];
    const account = sections.find(s => s.contains($('save-profile-btn')));
    const avatar = view.querySelector('.profile-avatar-section');
    const banner = sections.find(s => s.contains($('profile-banner-preview')));
    const profilePanel = box('workspace-settings-profile workspace-panel', [box('workspace-settings-media', [avatar, banner]), account]); profilePanel.id = 'workspace-settings-profile';
    const appearance = box('workspace-panel', [$('appearance-section')]); appearance.id = 'workspace-settings-appearance';
    const security = box('workspace-panel', [$('change-password-section'), view.querySelector('.danger-zone-section')]); security.id = 'workspace-settings-security';
    const invitations = box('workspace-panel', [$('referral-section')]); invitations.id = 'workspace-settings-invitations';
    const tabs = tabPanels([{ key: 'profile', label: 'Profile & account', panel: profilePanel }, { key: 'appearance', label: 'Appearance', panel: appearance }, { key: 'security', label: 'Security', panel: security }, { key: 'invitations', label: 'Referrals', panel: invitations }], 'Settings categories', true);
    oldLayout.remove();
    view.querySelector('h1').after(make('p', 'workspace-page-intro', 'Make this space your own. Manage your profile, preferences and account.'));
    view.append(box('workspace-settings-layout', [tabs.nav, box('workspace-settings-content', [profilePanel, appearance, security, invitations])]));
    new MutationObserver(() => { if (view.style.display !== 'none') tabs.show('profile'); }).observe(view, { attributes: true, attributeFilter: ['style'] });
  }
  function support() {
    const view = $('view-support'); view.classList.add('workspace-v2');
    const form = view.querySelector('.support-form'), tickets = $('support-tickets-list'), title = tickets.previousElementSibling;
    const inbox = box('workspace-support-inbox', [title, tickets], 'aside');
    form.prepend(make('h2', 'workspace-section-title', 'New ticket'));
    view.append(box('workspace-support-layout', [inbox, form]));
    const syncEmpty = () => {
      const p = tickets.querySelector('.empty-state p');
      if (p?.textContent.includes('Submit one above')) p.textContent = 'Your support conversations will appear here.';
    };
    new MutationObserver(syncEmpty).observe(tickets, { childList: true, subtree: true, characterData: true }); syncEmpty();
  }
  function privacy() {
    const view = $('view-help'); view.classList.add('workspace-v2');
    const article = view.querySelector('.privacy-document'), body = view.querySelector('.privacy-document-scroll');
    const nav = make('nav', 'workspace-policy-nav'); nav.setAttribute('aria-label', 'Privacy policy contents'); nav.append(make('h2', '', 'On this page'));
    [...body.querySelectorAll('section')].forEach((section, i) => {
      section.id = `workspace-policy-${i + 1}`; const a = make('button', '', section.querySelector('h2').textContent.replace(/^\d+\.\s*/, ''));
      a.type = 'button'; if (i === 0) a.setAttribute('aria-current', 'location');
      a.addEventListener('click', () => {
        nav.querySelectorAll('button').forEach(b => b.removeAttribute('aria-current')); a.setAttribute('aria-current', 'location');
        section.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }); nav.append(a);
    });
    article.append(box('workspace-policy-layout', [nav, body]));
  }
  // Replace the subscription-history emoji with the existing history icon style.
  const historyIcon = $('sub-history-btn')?.querySelector('span');
  if (historyIcon) { historyIcon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'; }
  const originals = new Map([...document.querySelectorAll('.app-container [id]')].map(node => [node.id, node]));
  for (const transform of [library, community, leaderboard, friends, () => profile('view-my-profile', 'mp'), () => profile('view-user-profile', 'up'), settings, support, privacy]) {
    try { transform(); } catch (e) { console.error('Workspace layout enhancement failed:', e); }
  }
  // The same nodes, inputs and data containers must survive every layout move.
  window.workspaceLayoutIntegrity = [...originals].every(([id, node]) => $(id) === node);
  const arrowTargets = '.sidebar-compose-detail,.sidebar-plan-arrow,.sidebar-streak-arrow,.glow-doc-arrow,#glow-all-docs>span';
  const iconize = () => document.querySelectorAll(arrowTargets).forEach(el => el.classList.add('workspace-up-right'));
  iconize(); new MutationObserver(iconize).observe($('glow-recent-docs'), { childList: true });
})();
