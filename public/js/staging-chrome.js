/* Staging app chrome only. Session configuration/actions remain in App. */
(() => {
  const container = document.querySelector('.app-container');
  const sidebar = document.getElementById('sidebar');
  const picker = document.getElementById('session-modal');
  if (!container || !sidebar || !picker) return;
  const logo = document.getElementById('sidebar-logo-btn');
  const chevron = document.getElementById('sidebar-collapse-chevron');
  const controls = [logo, chevron, document.getElementById('appearance-collapse-toggle'), document.getElementById('mobile-sidebar-toggle')].filter(Boolean);
  controls.forEach(control => control.addEventListener('click', () => {
    if (!container.classList.contains('shell-motion-ready')) {
      container.classList.add('shell-motion-ready');
      void sidebar.offsetWidth;
    }
  }, true));
  function syncRail() {
    const collapsed = container.classList.contains('sidebar-collapsed');
    for (const control of [logo, chevron]) {
      control.setAttribute('aria-expanded', String(!collapsed));
      control.setAttribute('aria-controls', 'sidebar');
      control.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      control.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    }
    chevron.tabIndex = collapsed ? -1 : 0;
    if (collapsed && document.activeElement === chevron) logo.focus({ preventScroll: true });
    sidebar.querySelectorAll('.sidebar-nav-item').forEach(button => {
      const label = button.querySelector('.sidebar-label')?.textContent.trim();
      if (label) { button.title = label; button.setAttribute('aria-label', label); }
    });
  }
  new MutationObserver(syncRail).observe(container, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(syncRail).observe(sidebar, { childList: true, subtree: true, characterData: true });
  syncRail();
  const cards = [...picker.querySelectorAll('.mode-option')];
  const syncSelected = () => cards.forEach(card => card.setAttribute('aria-pressed', String(card.classList.contains('active'))));
  cards.forEach(card => new MutationObserver(syncSelected).observe(card, { attributes: true, attributeFilter: ['class'] }));
  let returnFocus = null;
  let wasOpen = false;
  function syncPicker() {
    const open = picker.classList.contains('active');
    picker.inert = !open;
    if (open === wasOpen) return;
    wasOpen = open;
    if (open) {
      returnFocus = document.activeElement;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (picker.classList.contains('active')) document.getElementById('modal-cancel').focus({ preventScroll: true });
      }));
    } else if (picker.contains(document.activeElement) && returnFocus?.isConnected) {
      returnFocus.focus({ preventScroll: true });
    }
  }
  new MutationObserver(syncPicker).observe(picker, { attributes: true, attributeFilter: ['class'] });
  syncPicker();
  picker.addEventListener('click', event => { if (event.target === picker) App.closeSessionModal(); });
  picker.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); App.closeSessionModal(); return; }
    if (event.key !== 'Tab') return;
    const stops = [...picker.querySelectorAll('button:not(:disabled),input:not([type="hidden"]):not(:disabled),select:not(:disabled),[tabindex="0"]')]
      .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const first = stops[0], last = stops.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
})();
