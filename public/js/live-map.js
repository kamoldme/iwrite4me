(() => {
  const map = document.getElementById('live-world-map');
  const badge = document.getElementById('world-map-status');
  const label = document.getElementById('world-map-status-label');
  const detail = document.getElementById('world-map-detail');
  let paths = [], lastSuccess = 0, inFlight = false;
  const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
  function status(live) {
    if (!badge) return;
    badge.classList.toggle('is-live', live);
    label.textContent = live ? 'LIVE' : (lastSuccess ? 'RECONNECTING' : 'CONNECTING');
  }
  if (map) {
    fetch('/media/world-countries.svg?v=1').then(r => { if (!r.ok) throw Error('Map unavailable'); return r.text(); }).then(svg => {
      map.innerHTML = svg;
      paths = [...map.querySelectorAll('[data-country]')];
      paths.forEach(path => {
        const describe = () => { detail.textContent = path.querySelector('title').textContent; };
        path.addEventListener('pointerenter', describe);
        path.addEventListener('focus', describe);
        path.addEventListener('click', describe);
        path.addEventListener('pointerleave', () => { detail.textContent = 'Activity in the last 5 minutes'; });
        path.addEventListener('blur', () => { detail.textContent = 'Activity in the last 5 minutes'; });
      });
      tick();
    }).catch(() => { detail.textContent = 'The map is temporarily unavailable'; tick(); });
  }
  async function tick() {
    if (document.hidden || inFlight) return;
    inFlight = true;
    try {
      // No account, cookie, browser location permission, or persistent ID required.
      await fetch('/api/live-map/heartbeat', { method: 'POST', credentials: 'omit', signal: AbortSignal.timeout(8000) });
      if (map && paths.length) {
        const response = await fetch('/api/live-map', { credentials: 'omit', signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw Error('Live activity unavailable');
        const data = await response.json();
        if (!data.countries || !Number.isFinite(Date.parse(data.updatedAt)) || Date.now() - Date.parse(data.updatedAt) > 60000) throw Error('Stale activity');
        paths.forEach(path => {
          const code = path.dataset.country;
          const count = Number(data.countries[code]) || 0;
          path.classList.toggle('is-active', count > 0);
          const name = code ? countryNames.of(code) : path.dataset.name;
          path.querySelector('title').textContent = `${name}: ${count} recent ${count === 1 ? 'visitor' : 'visitors'}`;
          if (count) { path.setAttribute('tabindex', '0'); path.setAttribute('aria-label', path.querySelector('title').textContent); }
          else { path.removeAttribute('tabindex'); path.removeAttribute('aria-label'); }
        });
        lastSuccess = Date.now();
        status(true);
      }
    } catch { status(false); }
    finally { inFlight = false; }
  }
  if (!map) tick();
  setInterval(tick, 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { if (Date.now() - lastSuccess > 60000) status(false); tick(); }
  });
})();
