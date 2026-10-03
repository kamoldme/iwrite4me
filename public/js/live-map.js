(() => {
  const map = document.getElementById('world-map');
  const detail = document.getElementById('world-map-detail');
  if (!map || !detail) return;

  // Five countries appear in the traffic snapshot shared by the site owner.
  // The others were requested for this illustration; no visitor totals are inferred.
  const observed = new Set(['UZ', 'AM', 'GB', 'NG', 'EG']);
  const selected = new Set([
    ...observed, 'US', 'ES', 'KZ', 'KG', 'TJ', 'TM',
    'CA', 'DE', 'FR', 'IT', 'TR', 'AE', 'IN', 'PK', 'AU'
  ]);
  const defaultDetail = detail.textContent;

  fetch('/media/world-countries.svg?v=2')
    .then(response => {
      if (!response.ok) throw new Error('Map unavailable');
      return response.text();
    })
    .then(svg => {
      map.innerHTML = svg;
      const title = map.querySelector('#world-map-title');
      if (title) title.textContent = 'Countries highlighted on the iWrite map';

      map.querySelectorAll('[data-country]').forEach(path => {
        const code = path.dataset.country;
        if (!selected.has(code)) return;
        const name = path.dataset.name || code;
        const description = observed.has(code)
          ? `${name} · shown in the shared traffic snapshot`
          : `${name} · selected for this map`;
        path.classList.add('is-highlighted');
        path.setAttribute('tabindex', '0');
        path.setAttribute('aria-label', description);
        const pathTitle = path.querySelector('title');
        if (pathTitle) pathTitle.textContent = description;
        const show = () => { detail.textContent = description; };
        const reset = () => { detail.textContent = defaultDetail; };
        path.addEventListener('pointerenter', show);
        path.addEventListener('focus', show);
        path.addEventListener('pointerleave', reset);
        path.addEventListener('blur', reset);
      });
    })
    .catch(() => { detail.textContent = 'The map is temporarily unavailable'; });
})();
