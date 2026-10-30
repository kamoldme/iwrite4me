/* Staging inbox reset and rolling seven-day retention. Source records stay in
   their existing archive; this policy controls the current notification feed. */
const NotificationPolicy = (() => {
  const resetAt = Date.parse('2026-10-30T16:15:34Z');
  const lifetime = 7 * 24 * 60 * 60 * 1000;
  const current = (item, now) => {
    const created = Date.parse(item?.createdAt);
    return Number.isFinite(created) && created > resetAt && created <= now && created + lifetime > now;
  };
  return Object.freeze({
    resetAt, lifetime,
    filter(items, now = Date.now()) { return (Array.isArray(items) ? items : []).filter(item => current(item, now)); },
    nextExpiry(items, now = Date.now()) {
      const dates = this.filter(items, now).map(item => Date.parse(item.createdAt) + lifetime);
      return dates.length ? Math.min(...dates) : null;
    }
  });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NotificationPolicy;
