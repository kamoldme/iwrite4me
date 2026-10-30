/* Paper-only viewport zoom. Saved content and authored font settings are never
   touched; the toolbar and side rails stay in screen pixels. */
(() => {
  function setup() {
    const container = document.getElementById('editor-container');
    const desk = container?.querySelector('.editor-writing-desk');
    const stage = container?.querySelector('.editor-paper-stage');
    const paper = container?.querySelector('.editor-area');
    if (!desk || !stage || !paper) return;
    let zoom = 100, frame = 0;
    const render = () => {
      if (!desk.clientWidth) return;
      const pageless = container.classList.contains('pageless-mode');
      const availableWidth = Math.max(200, desk.clientWidth - (innerWidth <= 600 ? 24 : 48));
      const width = pageless ? availableWidth : Math.min(794, availableWidth);
      const set = (element, key, value) => { if (element.style[key] !== value) element.style[key] = value; };
      const formatting = desk.querySelector('#formatting-toolbar');
      const inset = formatting?.getClientRects().length ? formatting.offsetHeight : 0;
      const minHeight = `${Math.max(200, desk.clientHeight - inset - 40)}px`;
      if (paper.style.getPropertyValue('--pageless-height') !== minHeight) paper.style.setProperty('--pageless-height', minHeight);
      set(paper, 'width', `${width}px`);
      set(paper, 'transform', `scale(${zoom / 100})`);
      set(stage, 'width', `${width * zoom / 100}px`);
      set(stage, 'height', `${paper.offsetHeight * zoom / 100}px`);
      const label = document.getElementById('paper-zoom-value');
      if (label.textContent !== `${zoom}%`) label.textContent = `${zoom}%`;
      document.getElementById('paper-zoom-out').disabled = zoom <= 50;
      document.getElementById('paper-zoom-in').disabled = zoom >= 200;
      stage.dataset.zoom = String(zoom);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); };
    App.setPaperZoom = value => {
      const next = Math.min(200, Math.max(50, Math.round(Number(value) / 10) * 10));
      if (!Number.isFinite(next)) return;
      const old = zoom / 100;
      const centerX = (desk.scrollLeft + desk.clientWidth / 2 - stage.offsetLeft) / old;
      zoom = next; render();
      desk.scrollLeft = stage.offsetLeft + centerX * zoom / 100 - desk.clientWidth / 2;
      // Keep the paper's normal top gap below any visible formatting controls.
      const formatting = desk.querySelector('#formatting-toolbar');
      const inset = formatting?.getClientRects().length ? formatting.offsetHeight : 0;
      const gap = parseFloat(getComputedStyle(stage).marginTop) || 0;
      desk.scrollTop = Math.max(0, stage.offsetTop - inset - gap);
    };
    App.setPageless = enabled => {
      container.classList.toggle('pageless-mode', !!enabled);
      localStorage.setItem('iwrite_pageless', enabled ? '1' : '0');
      document.getElementById('tools-pageless-row').setAttribute('aria-checked', String(!!enabled));
      document.getElementById('tools-pageless-toggle').classList.toggle('on', !!enabled);
      App.setPaperZoom(100);
    };
    document.getElementById('tools-pageless-row').onclick = () => App.setPageless(!container.classList.contains('pageless-mode'));
    App.setPageless(localStorage.getItem('iwrite_pageless') === '1');
    document.getElementById('paper-zoom-out').onclick = () => App.setPaperZoom(zoom - 10);
    document.getElementById('paper-zoom-in').onclick = () => App.setPaperZoom(zoom + 10);
    document.getElementById('paper-zoom-reset').onclick = () => App.setPaperZoom(100);
    new ResizeObserver(schedule).observe(desk);
    new ResizeObserver(schedule).observe(paper);
    window.addEventListener('resize', schedule);
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
})();
