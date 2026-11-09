// Cohorts are derived from existing operational records. No draft text, email,
// IP address, new identifier or analytics cookie is read or recorded here.
const DAY = 86400000;
function time(value) { const n = Date.parse(value); return Number.isFinite(n) ? n : null; }
function monday(value) { const d = new Date(value); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }
function growthFunnel({ users, documents, logs, payments, guests }, now = Date.now()) {
  const cohorts = new Map();
  const group = items => { const result = new Map(); for (const item of items) { const list = result.get(item.userId) || []; list.push(item); result.set(item.userId, list); } return result; };
  const docsByUser = group(documents), logsByUser = group(logs), paymentsByUser = group(payments);
  for (const user of users) {
    const registered = time(user.createdAt);
    if (registered === null || registered > now || registered < now - 90 * DAY || user.isAdmin === true || user.role === 'admin') continue;
    const key = monday(registered);
    const row = cohorts.get(key) || { week: key, signups: 0, started: 0, completed: 0, returned: 0, checkout: 0, paid: 0, mature: 0 };
    row.signups++;
    if (registered + 7 * DAY <= now) row.mature++;
    const end = Math.min(now, registered + 7 * DAY);
    const docs = (docsByUser.get(user.id) || []).filter(d => time(d.createdAt) !== null && (time(d.createdAt) >= registered || (d.guestTrial === true && time(d.completedAt) !== null && time(d.completedAt) >= registered)) && time(d.createdAt) <= end).sort((a,b) => time(a.createdAt)-time(b.createdAt));
    if (docs.length) row.started++;
    if (docs.some(d => d.completed === true && time(d.completedAt) !== null && time(d.completedAt) <= end)) row.completed++;
    if (docs.length >= 2) row.returned++;
    const events = (logsByUser.get(user.id) || []).filter(l => time(l.timestamp) !== null && time(l.timestamp) >= registered && time(l.timestamp) <= end);
    if (events.some(l => l.action === 'stripe_checkout_created')) row.checkout++;
    const stripePaid = events.some(l => l.action === 'stripe_subscription_created' && l.source === 'stripe');
    const localPaid = (paymentsByUser.get(user.id) || []).some(p => p.state === 'paid' && time(p.paidAt) !== null && time(p.paidAt) >= registered && time(p.paidAt) <= end);
    if (stripePaid || localPaid) row.paid++;
    cohorts.set(key, row);
  }
  const cutoff = now - 7 * DAY;
  const recentGuests = guests.filter(g => time(g.startedAt) !== null && time(g.startedAt) >= cutoff && time(g.startedAt) <= now);
  return { cohorts: [...cohorts.values()].sort((a,b) => b.week.localeCompare(a.week)), guestLast7Days: { started: recentGuests.length, saved: recentGuests.filter(g => g.claimed === true).length } };
}
module.exports = { growthFunnel };
