// The VPS currently has a newer dashboard notification panel than this branch.
// Apply this narrow fix to its app.js until that UI is synced into the repository.
const fs = require('node:fs');

const before = "window.addEventListener('scroll', () => this.closeDashboardNotifications(), true);";
const after = `window.addEventListener('scroll', event => {
        // The notification list scrolls inside the popover. Only page scrolling
        // should dismiss it.
        if (event.target instanceof Node && dropdown.contains(event.target)) return;
        this.closeDashboardNotifications();
      }, true);`;

function patch(source) {
  if (source.includes(after)) return source;
  if (source.split(before).length !== 2) throw new Error('Expected dashboard scroll handler was not found exactly once.');
  return source.replace(before, after);
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/patch-dashboard-notification-scroll.js /path/to/app.js');
  const original = fs.readFileSync(file, 'utf8');
  const updated = patch(original);
  if (updated !== original) fs.writeFileSync(file, updated);
}

module.exports = { patch };
