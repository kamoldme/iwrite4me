/* Staging dashboard widgets: real saved-session data, no simulated live values. */
(() => {
  const view = document.getElementById('view-dashboard');
  const container = document.querySelector('.app-container');
  if (!view || !container) return;
  const $ = id => view.querySelector(`#${id}`);
  function syncVisibility() {
    container.dataset.glowDashboard = getComputedStyle(view).display !== 'none' ? 'true' : 'false';
  }
  new MutationObserver(syncVisibility).observe(view, { attributes: true, attributeFilter: ['style', 'class'] });
  syncVisibility();
  const marker = document.createElement('p'); marker.className = 'glow-staging-mark';
  marker.textContent = 'Staging preview · Separate copy of production';
  if (location.hostname.includes('staging') || location.hostname === 'localhost') view.prepend(marker);

  function docs() {
    return (App.documents || []).filter(d => !d.deleted && !d.deletedBySystem && !d.deactivatedByAdmin);
  }
  function words(doc) {
    const n = Number(doc.wordCount); return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }
  function smoothPath(points) {
    let path = `M${points[0].join(',')}`;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i], mid = (x0 + x1) / 2;
      path += ` C${mid},${y0} ${mid},${y1} ${x1},${y1}`;
    }
    return path;
  }
  function renderActivity() {
    if (App.user?.username === 'staging_preview') marker.textContent = 'Staging preview · Sample account data';
    const length = Number($('glow-range').value) === 30 ? 30 : 7;
    const days = Array.from({ length }, (_, i) => {
      const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - length + 1 + i);
      return { date, words: 0 };
    });
    for (const doc of docs()) {
      const date = new Date(doc.updatedAt || doc.createdAt);
      const day = days.find(d => d.date.toDateString() === date.toDateString());
      if (day) day.words += words(doc);
    }
    const total = days.reduce((sum, day) => sum + day.words, 0);
    $('glow-week-words').textContent = total.toLocaleString();
    $('glow-empty').hidden = total > 0;
    const max = Math.max(...days.map(day => day.words), 1);
    const points = days.map((day, i) => [20 + i * 872 / (length - 1), 267 - (day.words / max) * 99]);
    const line = smoothPath(points), last = points.at(-1);
    $('glow-chart').innerHTML = `<svg viewBox="0 0 912 300" preserveAspectRatio="none" role="img" aria-labelledby="glow-chart-title"><title id="glow-chart-title"></title><defs><linearGradient id="glow-area" x1="0" y1="0" x2="0" y2="1"><stop style="stop-color:var(--glow-emerald)" stop-opacity=".32"/><stop offset="1" style="stop-color:var(--glow-emerald)" stop-opacity=".02"/></linearGradient><filter id="glow-line-blur" x="-10%" y="-100%" width="120%" height="300%"><feGaussianBlur stdDeviation="5"/></filter><filter id="glow-marker-blur" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="6"/></filter></defs><path d="${line} L912,300 L0,300Z" fill="url(#glow-area)"/><path d="${line}" fill="none" style="stroke:var(--glow-emerald)" stroke-width="10" opacity=".5" filter="url(#glow-line-blur)"/><path d="${line}" fill="none" style="stroke:var(--glow-green)" stroke-width="3" stroke-linecap="round"/><path d="M${last[0]},${last[1]} V300" stroke="white" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="3 5"/><circle cx="${last[0]}" cy="${last[1]}" r="14" fill="#34d399" opacity=".5" filter="url(#glow-marker-blur)"/>${points.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === length - 1 ? 5 : 4}" fill="${i === length - 1 ? '#fff' : 'transparent'}" tabindex="0" role="img" data-point="${i}"><title></title></circle>`).join('')}</svg>`;
    const description = days.map(day => `${day.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${day.words.toLocaleString()} words`);
    $('glow-chart-title').textContent = `${total.toLocaleString()} words in ${length} days. ${description.join('; ')}`;
    for (const point of $('glow-chart').querySelectorAll('[data-point]')) {
      const label = description[Number(point.dataset.point)]; point.setAttribute('aria-label', label); point.querySelector('title').textContent = label;
    }
    renderRhythm();
  }
  function renderRhythm() {
    const sessions = docs().slice().sort((a, b) => new Date(a.updatedAt || a.createdAt) - new Date(b.updatedAt || b.createdAt)).slice(-20);
    const max = Math.max(...sessions.map(words), 1);
    $('glow-rhythm-caption').textContent = sessions.length ? `Words across your last ${sessions.length} saved sessions` : 'Your next session starts the rhythm';
    const bars = sessions.length ? sessions : Array.from({ length: 20 }, () => ({ wordCount: 0 }));
    $('glow-rhythm-bars').replaceChildren(...bars.map(doc => {
      const bar = document.createElement('span'); bar.className = 'glow-rhythm-bar';
      bar.style.setProperty('--bar-height', `${Math.max(4, words(doc) / max * 86)}px`);
      bar.title = `${words(doc).toLocaleString()} words`; return bar;
    }));
    $('glow-rhythm-bars').setAttribute('aria-label', sessions.length ? `Recent session word counts: ${sessions.map(words).join(', ')}` : 'No saved sessions yet');
  }
  const ticks = Array.from({ length: 49 }, (_, i) => {
    const angle = (-135 + 270 * i / 48) * Math.PI / 180;
    return `<line class="glow-dial-tick" x1="${220 + 142 * Math.sin(angle)}" y1="${229.5 - 142 * Math.cos(angle)}" x2="${220 + 158 * Math.sin(angle)}" y2="${229.5 - 158 * Math.cos(angle)}"/>`;
  });
  $('glow-dial').innerHTML = `<svg viewBox="0 0 440 440"><defs><filter id="goal-knob-glow" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="6"/></filter></defs>${ticks.join('')}<g class="glow-dial-knob"><circle r="15" fill="#fb9b52" opacity=".6" filter="url(#goal-knob-glow)"/><circle r="9" fill="#fff"/></g></svg>`;
  function renderGoal() {
    const today = new Date().toISOString().slice(0, 10);
    const completed = docs().reduce((sum, doc) => {
      const date = new Date(doc.updatedAt || doc.createdAt);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === today ? sum + words(doc) : sum;
    }, 0);
    const goal = Math.max(1, parseInt(localStorage.getItem('iwrite_daily_goal') || '1000', 10) || 1000);
    const progress = Math.min(1, completed / goal);
    const kicker = $('hero-kicker');
    if (kicker) kicker.textContent = `${completed.toLocaleString()} words today · ${Math.max(1, 24 - new Date().getHours())}h left`;
    $('glow-goal-percent').textContent = Math.round(progress * 100);
    const angle = (-135 + 270 * progress) * Math.PI / 180;
    $('glow-dial').querySelector('.glow-dial-knob').style.transform = `translate(${220 + 150 * Math.sin(angle)}px,${229.5 - 150 * Math.cos(angle)}px)`;
    $('glow-dial').querySelectorAll('.glow-dial-tick').forEach((tick, i) => tick.classList.toggle('lit', completed > 0 && i / 48 <= progress));
  }
  new MutationObserver(renderGoal).observe(view.querySelector('.td-progress-count'), { childList: true, subtree: true, characterData: true });
  new MutationObserver(renderActivity).observe($('heatmap-grid'), { childList: true });
  $('glow-range').addEventListener('change', renderActivity);
  renderGoal(); renderActivity();
})();
