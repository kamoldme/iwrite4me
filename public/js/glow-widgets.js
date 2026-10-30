/* Staging dashboard: saved-session data, isolated from the editor and landing. */
(() => {
  const view = document.getElementById('view-dashboard');
  const container = document.querySelector('.app-container');
  if (!view || !container) return;
  const $ = id => view.querySelector(`#${id}`);
  const setText = (id, text) => {
    const el = $(id);
    if (el && el.textContent !== String(text)) el.textContent = text;
  };
  const dateOf = doc => new Date(doc.updatedAt || doc.createdAt);
  const shortDate = date => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  function syncVisibility() {
    container.dataset.glowDashboard = getComputedStyle(view).display !== 'none' ? 'true' : 'false';
    if (container.dataset.glowDashboard === 'true') renderGoal();
  }
  const marker = document.createElement('p');
  marker.className = 'glow-staging-mark';
  marker.textContent = 'Staging preview · Separate copy of production';
  if (location.hostname.includes('staging') || location.hostname === 'localhost') view.prepend(marker);
  function docs() {
    return (App.documents || []).filter(d => !d.deleted && !d.deletedBySystem && !d.deactivatedByAdmin);
  }
  function words(doc) {
    const n = Number(doc.wordCount);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }
  function smoothPath(points) {
    let path = `M${points[0].join(',')}`;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i], mid = (x0 + x1) / 2;
      path += ` C${mid},${y0} ${mid},${y1} ${x1},${y1}`;
    }
    return path;
  }
  let activityDays = [];
  function readDay(index) {
    const day = activityDays[index];
    if (day) setText('glow-point-readout', `${shortDate(day.date)} · ${day.words.toLocaleString()} words`);
  }
  function renderActivity() {
    if (App.user?.username === 'staging_preview') marker.textContent = 'Staging preview · Sample account data';
    const length = Number($('glow-range').value) === 30 ? 30 : 7;
    activityDays = Array.from({ length }, (_, i) => {
      const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - length + 1 + i);
      return { date, words: 0 };
    });
    for (const doc of docs()) {
      const day = activityDays.find(d => sameDay(d.date, dateOf(doc)));
      if (day) day.words += words(doc);
    }
    const total = activityDays.reduce((sum, day) => sum + day.words, 0);
    setText('glow-week-words', total.toLocaleString());
    $('glow-empty').hidden = total > 0;
    const max = Math.max(...activityDays.map(day => day.words), 1);
    const points = activityDays.map((day, i) => [24 + i * 864 / (length - 1), 246 - (day.words / max) * 94]);
    const line = smoothPath(points), last = points.at(-1);
    $('glow-chart').innerHTML = `<svg viewBox="0 0 912 300" preserveAspectRatio="none" role="img" aria-labelledby="glow-chart-title"><title id="glow-chart-title"></title><defs><linearGradient id="glow-area" x1="0" y1="0" x2="0" y2="1"><stop style="stop-color:var(--glow-emerald)" stop-opacity=".32"/><stop offset="1" style="stop-color:var(--glow-emerald)" stop-opacity=".02"/></linearGradient><filter id="glow-line-blur" x="-10%" y="-100%" width="120%" height="300%"><feGaussianBlur stdDeviation="5"/></filter></defs><path d="${line} L912,300 L0,300Z" fill="url(#glow-area)"/><path d="${line}" fill="none" style="stroke:var(--glow-emerald)" stroke-width="10" opacity=".45" filter="url(#glow-line-blur)"/><path d="${line}" fill="none" style="stroke:var(--glow-green)" stroke-width="3" stroke-linecap="round"/><path d="M${last[0]},${last[1]} V270" stroke="white" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="3 5"/>${points.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === length - 1 ? 5 : 3}" fill="${i === length - 1 ? '#fff' : '#8cffd4'}"/>`).join('')}</svg>`;
    setText('glow-chart-title', `${total.toLocaleString()} saved words over ${length} days. Daily values are available in View activity data below.`);
    setText('glow-date-start', shortDate(activityDays[0].date));
    setText('glow-date-end', shortDate(activityDays.at(-1).date));
    readDay(length - 1);
    $('glow-data-rows').replaceChildren(...activityDays.map(day => {
      const row = document.createElement('tr');
      for (const text of [day.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }), day.words.toLocaleString()]) {
        const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
      }
      return row;
    }));
    renderRhythm(); renderRecent(); renderGoal();
  }
  function renderRecent() {
    const recent = docs().slice().sort((a, b) => dateOf(b) - dateOf(a)).slice(0, 3);
    const list = $('glow-recent-docs');
    list.replaceChildren();
    if (!recent.length) {
      const message = document.createElement('p'); message.className = 'glow-recent-empty';
      message.textContent = 'A blank page is a good beginning. Your saved documents will appear here.';
      list.append(message); return;
    }
    for (const doc of recent) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'glow-document';
      const icon = document.createElement('span'); icon.className = 'glow-doc-icon'; icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6"/></svg>';
      const copy = document.createElement('span'); copy.className = 'glow-doc-copy';
      const title = document.createElement('strong'); title.textContent = doc.title || 'Untitled document';
      const meta = document.createElement('span'); meta.textContent = `${words(doc).toLocaleString()} words · ${Number.isFinite(dateOf(doc).getTime()) ? shortDate(dateOf(doc)) : 'Saved document'}`;
      copy.append(title, meta);
      const arrow = document.createElement('span'); arrow.className = 'glow-doc-arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
      button.append(icon, copy, arrow);
      button.addEventListener('click', () => App.openDocument(doc.id)); list.append(button);
    }
  }
  function renderRhythm() {
    const sessions = docs().slice().sort((a, b) => dateOf(a) - dateOf(b)).slice(-20);
    const plot = $('glow-rhythm-bars');
    const max = Math.max(...sessions.map(words), 1);
    const average = sessions.length ? Math.round(sessions.reduce((sum, doc) => sum + words(doc), 0) / sessions.length) : 0;
    setText('glow-rhythm-caption', sessions.length ? `Words in your last ${sessions.length} saved sessions` : 'Your saved sessions will appear here');
    setText('glow-rhythm-average', average.toLocaleString());
    plot.replaceChildren();
    if (!sessions.length) {
      const empty = document.createElement('p'); empty.className = 'session-chart-empty';
      empty.textContent = 'Save a session to begin your graph.'; plot.append(empty);
      setText('glow-rhythm-readout', 'No saved sessions yet'); return;
    }
    const points = sessions.map((doc, i) => [48 + (sessions.length === 1 ? 210 : i * 420 / (sessions.length - 1)), 156 - words(doc) / max * 126]);
    const line = smoothPath(points);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 516 190'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<defs><linearGradient id="session-chart-area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="currentColor" stop-opacity=".18"/><stop offset="1" stop-color="currentColor" stop-opacity=".02"/></linearGradient></defs>${[30,93,156].map(y => `<path class="session-chart-grid" d="M48 ${y}H468"/>`).join('')}<text x="2" y="34">${max.toLocaleString()}</text><text x="2" y="160">0</text><path d="${line} L${points.at(-1)[0]},156 L${points[0][0]},156Z" fill="url(#session-chart-area)"/><path d="${line}" fill="none" stroke="currentColor" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`;
    plot.append(svg);
    const buttons = sessions.map((doc, i) => {
      const point = document.createElement('button'); point.type = 'button'; point.className = 'session-chart-point';
      point.style.left = `${points[i][0] / 516 * 100}%`; point.style.top = `${points[i][1] / 190 * 100}%`;
      const label = `${shortDate(dateOf(doc))} · ${words(doc).toLocaleString()} words`;
      point.setAttribute('aria-label', label);
      const select = () => {
        setText('glow-rhythm-readout', label);
        plot.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === point)));
      };
      point.addEventListener('pointerenter', select); point.addEventListener('focus', select); point.addEventListener('click', select);
      point.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? sessions.length - 1 : Math.max(0, Math.min(sessions.length - 1, i + (event.key === 'ArrowLeft' ? -1 : 1)));
        buttons[next].focus();
      });
      point.setAttribute('aria-pressed', String(i === sessions.length - 1)); return point;
    });
    plot.append(...buttons);
    const dates = document.createElement('div'); dates.className = 'session-chart-dates';
    for (const doc of [sessions[0], sessions.at(-1)]) { const date = document.createElement('span'); date.textContent = shortDate(dateOf(doc)); dates.append(date); }
    plot.append(dates);
    setText('glow-rhythm-readout', `${shortDate(dateOf(sessions.at(-1)))} · ${words(sessions.at(-1)).toLocaleString()} words`);
  }
  const ticks = Array.from({ length: 49 }, (_, i) => {
    const angle = (-135 + 270 * i / 48) * Math.PI / 180;
    return `<line class="glow-dial-tick" x1="${220 + 142 * Math.sin(angle)}" y1="${229.5 - 142 * Math.cos(angle)}" x2="${220 + 158 * Math.sin(angle)}" y2="${229.5 - 158 * Math.cos(angle)}"/>`;
  });
  $('glow-dial').innerHTML = `<svg viewBox="0 0 440 440">${ticks.join('')}<g transform="translate(220 229.5)"><g class="glow-dial-knob"><circle cy="-150" r="14" fill="#fb9b52" opacity=".25"/><circle cy="-150" r="9" fill="#fff"/></g></g></svg>`;
  function renderGoal() {
    const today = new Date();
    const completed = docs().reduce((sum, doc) => sameDay(dateOf(doc), today) ? sum + words(doc) : sum, 0);
    const goal = Math.max(1, parseInt(localStorage.getItem('iwrite_daily_goal') || '1000', 10) || 1000);
    const progress = Math.min(1, completed / goal);
    setText('hero-kicker', `${completed.toLocaleString()} words today. ${completed >= goal ? 'Your daily goal is complete.' : `${Math.max(0, goal - completed).toLocaleString()} to your daily goal.`}`);
    setText('td-words-today', completed.toLocaleString()); setText('td-words-goal', goal.toLocaleString());
    setText('td-progress-head', completed >= goal ? 'Goal reached. Keep the momentum.' : completed > 0 ? 'Every word moves you forward.' : 'One sentence is a start.');
    setText('glow-goal-percent', Math.round(progress * 100));
    $('glow-dial').closest('.td-progress-card').style.setProperty('--goal-progress', `${progress * 100}%`);
    $('glow-dial').querySelector('.glow-dial-knob').style.transform = `rotate(${-135 + 270 * progress}deg)`;
    $('glow-dial').querySelectorAll('.glow-dial-tick').forEach((tick, i) => tick.classList.toggle('lit', completed > 0 && i / 48 <= progress));
  }
  $('glow-chart').addEventListener('pointermove', event => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = ((event.clientX - rect.left) / rect.width * 912 - 24) / 864;
    readDay(Math.max(0, Math.min(activityDays.length - 1, Math.round(fraction * (activityDays.length - 1)))));
  });
  $('glow-chart').addEventListener('pointerleave', () => readDay(activityDays.length - 1));
  $('glow-all-docs').addEventListener('click', () => App.switchView('documents'));
  new MutationObserver(syncVisibility).observe(view, { attributes: true, attributeFilter: ['style', 'class'] });
  new MutationObserver(renderGoal).observe(view.querySelector('.td-progress-count'), { childList: true, subtree: true, characterData: true });
  new MutationObserver(renderActivity).observe($('heatmap-grid'), { childList: true });
  $('glow-range').addEventListener('change', renderActivity);
  window.addEventListener('focus', renderGoal);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderGoal(); });
  // Refresh the local day boundary without animating or polling the server.
  setInterval(() => { if (!document.hidden && container.dataset.glowDashboard === 'true') renderGoal(); }, 60000);
  syncVisibility(); renderActivity();
})();
