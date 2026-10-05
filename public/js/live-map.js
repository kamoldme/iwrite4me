(() => {
  const map = document.getElementById('world-map');
  const detail = document.getElementById('world-map-detail');
  if (!map || !detail) return;

  // Five countries appear in the traffic snapshot shared by the site owner.
  // The others were requested for this illustration; no visitor totals are inferred.
  const observed = new Set(['UZ', 'AM', 'GB', 'NG', 'EG']);
  const selected = new Set([
    ...observed, 'US', 'ES', 'KZ', 'KG', 'TJ', 'TM',
    'CA', 'DE', 'FR', 'IT', 'TR', 'AE', 'IN', 'PK', 'AU',
    'RU', 'CN', 'ID', 'JP', 'BR'
  ]);
  const routeOrder = [
    'US', 'CA', 'ES', 'GB', 'FR', 'DE', 'IT', 'NG', 'EG', 'TR',
    'AE', 'IN', 'PK', 'AU', 'KZ', 'KG', 'TJ', 'TM', 'UZ',
    'RU', 'CN', 'ID', 'JP', 'BR'
  ];
  const defaultDetail = detail.textContent;
  const countryCount = document.getElementById('world-map-country-count');
  if (countryCount) countryCount.textContent = `${selected.size.toLocaleString()}+`;

  fetch('/media/world-countries.svg?v=3')
    .then(response => {
      if (!response.ok) throw new Error('Map unavailable');
      return response.text();
    })
    .then(svg => {
      map.innerHTML = svg;
      const title = map.querySelector('#world-map-title');
      if (title) title.remove();

      map.querySelectorAll('[data-country]').forEach(path => {
        const code = path.dataset.country;
        if (!selected.has(code)) return;
        const name = path.dataset.name || code;
        const description = name;
        path.classList.add('is-highlighted');
        path.style.setProperty('--flow-index', routeOrder.indexOf(code) === -1 ? routeOrder.length : routeOrder.indexOf(code));
        path.setAttribute('tabindex', '0');
        path.setAttribute('aria-label', description);
        const pathTitle = path.querySelector('title');
        if (pathTitle) pathTitle.remove();
        const show = () => { detail.textContent = description; };
        const reset = () => { detail.textContent = defaultDetail; };
        path.addEventListener('pointerenter', show);
        path.addEventListener('focus', show);
        path.addEventListener('pointerleave', reset);
        path.addEventListener('blur', reset);
      });

      const svgElement = map.querySelector('svg');
      const countryCenter = code => {
        const parts = [...map.querySelectorAll(`[data-country="${code}"]`)];
        const largest = parts.map(path => ({ path, box: path.getBBox() }))
          .sort((a, b) => (b.box.width * b.box.height) - (a.box.width * a.box.height))[0];
        if (!largest) return null;
        return {
          x: largest.box.x + largest.box.width / 2,
          y: largest.box.y + largest.box.height / 2
        };
      };
      const destination = countryCenter('AM');
      if (svgElement && destination) {
        const namespace = 'http://www.w3.org/2000/svg';
        const flows = document.createElementNS(namespace, 'g');
        flows.classList.add('world-map-flows');
        flows.setAttribute('aria-hidden', 'true');
        routeOrder.forEach((code, index) => {
          const source = countryCenter(code);
          if (!source) return;
          const distance = Math.hypot(destination.x - source.x, destination.y - source.y);
          const middleX = (source.x + destination.x) / 2;
          const middleY = (source.y + destination.y) / 2 - Math.min(65, distance * .17);
          const route = document.createElementNS(namespace, 'path');
          route.classList.add('world-map-flow');
          route.setAttribute('d', `M ${source.x} ${source.y} Q ${middleX} ${middleY} ${destination.x} ${destination.y}`);
          route.setAttribute('pathLength', '1');
          route.style.setProperty('--flow-index', index);
          flows.append(route);
        });
        svgElement.append(flows);
      }

      if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
          map.classList.toggle('is-in-view', entries[0].isIntersecting);
        }, { threshold: .1 });
        observer.observe(map);
      } else {
        map.classList.add('is-in-view');
      }
    })
    .catch(() => { detail.textContent = ''; });
})();
