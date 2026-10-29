/* Staging composition: keep the existing dashboard data and actions. */
(() => {
  const month = document.getElementById('experiment-month');
  const now = new Date();
  month.replaceChildren(document.createTextNode(now.toLocaleDateString(undefined, { month: 'long' }) + ' '));
  const year = document.createElement('span');
  year.textContent = now.getFullYear();
  month.append(year);
  function search() {
    App.switchView('documents');
    requestAnimationFrame(() => document.getElementById('session-search')?.focus());
  }
  document.getElementById('experiment-search').addEventListener('click', search);
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && document.getElementById('app-view').style.display !== 'none') {
      e.preventDefault(); search();
    }
  });
  function renderChart() {
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - 6 + i);
      return { date, words: 0 };
    });
    for (const doc of (App.documents || [])) {
      if (doc.deleted || doc.deletedBySystem) continue;
      const date = new Date(doc.updatedAt || doc.createdAt);
      const day = days.find(d => d.date.toDateString() === date.toDateString());
      if (day) day.words += Number(doc.wordCount) || 0;
    }
    const total = days.reduce((sum, d) => sum + d.words, 0);
    document.getElementById('experiment-week-words').textContent = total.toLocaleString();
    const max = Math.max(...days.map(d => d.words), 100);
    const points = days.map((d, i) => [36 + i * 78, 160 - d.words / max * 130]);
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.join(',')}`).join(' ');
    document.getElementById('experiment-chart').innerHTML = `<svg viewBox="0 0 540 195" role="img" aria-label="${total} words written over the last seven days"><defs><linearGradient id="writing-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#50c7a2" stop-opacity=".18"/><stop offset="1" stop-color="#50c7a2" stop-opacity="0"/></linearGradient></defs>${[30,95,160].map(y=>`<path d="M36 ${y}H504" stroke="#303030" fill="none"/>`).join('')}<path d="${path} L504,160 L36,160 Z" fill="url(#writing-chart-fill)"/><path d="${path}" fill="none" stroke="#50c7a2" stroke-width="2.5" stroke-linejoin="round"/>${points.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#50c7a2"><title>${days[i].words} words</title></circle><text x="${p[0]}" y="185" text-anchor="middle">${days[i].date.toLocaleDateString(undefined,{weekday:'short'})}</text>`).join('')}</svg>`;
  }
  new MutationObserver(renderChart).observe(document.getElementById('heatmap-grid'), { childList: true });
  renderChart();
})();
