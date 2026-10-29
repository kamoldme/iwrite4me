/* Staging workspace enhancements. All styling and DOM updates exclude the editor. */
(() => {
  const workspace = document.querySelector('.app-container');
  if (!workspace) return;
  const byId = id => workspace.querySelector(`#${id}`);
  const now = new Date();
  byId('experiment-month').textContent = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + ' · Your writing overview';
  byId('workspace-date').textContent = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (!/Mac|iPhone|iPad/.test(navigator.platform)) byId('experiment-search').querySelector('kbd').textContent = 'Ctrl K';
  function search() {
    App.switchView('documents');
    requestAnimationFrame(() => byId('session-search')?.focus());
  }
  byId('experiment-search').addEventListener('click', search);
  document.addEventListener('keydown', e => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
    if (document.getElementById('editor-container')?.classList.contains('active')) return;
    if (!workspace.getClientRects().length) return;
    e.preventDefault(); search();
  });
  const navButtons = [...workspace.querySelectorAll('.sidebar-nav-item[data-view]')];
  function syncNavigation() {
    for (const button of navButtons) {
      if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }
  const navObserver = new MutationObserver(syncNavigation);
  for (const button of navButtons) navObserver.observe(button, { attributes: true, attributeFilter: ['class'] });
  syncNavigation();
  let themeFrame;
  new MutationObserver(() => {
    workspace.classList.add('workspace-theme-switching');
    void workspace.offsetHeight;
    cancelAnimationFrame(themeFrame);
    themeFrame = requestAnimationFrame(() => requestAnimationFrame(() => workspace.classList.remove('workspace-theme-switching')));
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  function renderChart() {
    const range = Number(byId('workspace-chart-period').value) === 30 ? 30 : 7;
    const days = Array.from({ length: range }, (_, i) => {
      const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - range + 1 + i);
      return { date, words: 0 };
    });
    for (const doc of (App.documents || [])) {
      if (doc.deleted || doc.deletedBySystem || doc.deactivatedByAdmin) continue;
      const date = new Date(doc.updatedAt || doc.createdAt);
      const day = days.find(d => d.date.toDateString() === date.toDateString());
      const count = Number(doc.wordCount);
      if (day && Number.isFinite(count)) day.words += Math.max(0, Math.round(count));
    }
    const total = days.reduce((sum, d) => sum + d.words, 0);
    byId('experiment-week-words').textContent = total.toLocaleString();
    byId('experiment-chart-caption').textContent = `words in the last ${range} days`;
    const maximum = Math.max(...days.map(d => d.words), 100);
    const points = days.map((d, i) => [40 + i * 460 / (range - 1), 158 - d.words / maximum * 126]);
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.join(',')}`).join(' ');
    const labelFor = date => date.toLocaleDateString(undefined, range === 7 ? { weekday: 'short' } : { month: 'short', day: 'numeric' });
    // Localized date strings are text nodes below, not interpolated into HTML.
    byId('experiment-chart').innerHTML = `<svg viewBox="0 0 540 195" role="img" aria-labelledby="workspace-chart-title"><title id="workspace-chart-title"></title><defs><linearGradient id="writing-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="currentColor" stop-opacity=".14"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>${[32,95,158].map(y => `<path d="M40 ${y}H500" class="workspace-chart-grid" fill="none"/>`).join('')}<path d="${path} L500,158 L40,158 Z" fill="url(#writing-chart-fill)"/><path d="${path}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>${points.map((p,i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${range === 7 ? 3 : 2}" fill="currentColor"><title data-day="${i}"></title></circle>${range === 7 || i % 6 === 0 || i === range - 1 ? `<text x="${p[0]}" y="185" text-anchor="middle" data-day-label="${i}"></text>` : ''}`).join('')}</svg>`;
    byId('experiment-chart').querySelector('#workspace-chart-title').textContent = `${total.toLocaleString()} words over ${range} days. Daily values follow.`;
    for (const title of byId('experiment-chart').querySelectorAll('[data-day]')) {
      const day = days[Number(title.dataset.day)];
      title.textContent = `${labelFor(day.date)}: ${day.words.toLocaleString()} words`;
    }
    for (const label of byId('experiment-chart').querySelectorAll('[data-day-label]')) label.textContent = labelFor(days[Number(label.dataset.dayLabel)].date);
    const details = document.createElement('details'); details.className = 'workspace-chart-data';
    const summary = document.createElement('summary'); summary.textContent = 'View daily word counts'; details.append(summary);
    const list = document.createElement('dl');
    for (const day of days) {
      const term = document.createElement('dt'); term.textContent = labelFor(day.date);
      const value = document.createElement('dd'); value.textContent = day.words.toLocaleString();
      list.append(term, value);
    }
    details.append(list); byId('experiment-chart').append(details);
    if (!total) {
      const empty = document.createElement('p'); empty.className = 'workspace-chart-empty';
      empty.textContent = 'A blank page is a beginning. Your next saved session will appear here.';
      byId('experiment-chart').append(empty);
    }
  }
  byId('workspace-chart-period').addEventListener('change', renderChart);
  new MutationObserver(renderChart).observe(byId('heatmap-grid'), { childList: true });
  renderChart();
})();
