const { createHmac, randomBytes } = require('crypto');
const { BlockList, isIP } = require('net');
const countries = require('./map-countries.json');
const WINDOW_MS = 5 * 60 * 1000;
// Cloudflare's published origin-facing ranges, checked 2026-09-25.
// https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6
const edgeRanges = new BlockList();
for (const cidr of ['173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20','197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13','104.24.0.0/14','172.64.0.0/13','131.0.72.0/22','2400:cb00::/32','2606:4700::/32','2803:f800::/32','2405:b500::/32','2405:8100::/32','2a06:98c0::/29','2c0f:f248::/32']) {
  const [address, prefix] = cidr.split('/');
  edgeRanges.addSubnet(address, Number(prefix), isIP(address) === 6 ? 'ipv6' : 'ipv4');
}
function normalizeIP(value) { return String(value || '').replace(/^::ffff:/, ''); }
function cloudflareVisitor(req) {
  // Express trusts exactly our immediate reverse proxy. req.ip is therefore
  // the rightmost address appended by that proxy, not an arbitrary client header.
  const edge = normalizeIP(req.ip);
  const type = isIP(edge);
  if (!type || !edgeRanges.check(edge, type === 6 ? 'ipv6' : 'ipv4')) return null;
  const address = normalizeIP(req.headers['cf-connecting-ip']);
  if (!isIP(address)) return null;
  const country = String(req.headers['cf-ipcountry'] || '').toUpperCase();
  return { address, country: Object.hasOwn(countries, country) ? country : null };
}
function createTracker({ now = Date.now, maxVisitors = 20000 } = {}) {
  const salt = randomBytes(32);
  const visitors = new Map();
  let lastPrune = 0;
  function key(address, agent) { return createHmac('sha256', salt).update(`${address}\n${String(agent || '').slice(0, 300)}`).digest('hex'); }
  function prune() {
    const cutoff = now() - WINDOW_MS;
    for (const [id, visit] of visitors) if (visit.seenAt <= cutoff) visitors.delete(id);
    lastPrune = now();
  }
  return {
    key,
    record(source, agent) {
      if (!source?.country || !Object.hasOwn(countries, source.country) || /bot|crawler|spider|preview/i.test(agent || '')) return false;
      if (now() - lastPrune >= 10000) prune();
      const id = key(source.address, agent);
      visitors.delete(id);
      if (visitors.size >= maxVisitors) visitors.delete(visitors.keys().next().value);
      visitors.set(id, { country: source.country, seenAt: now() });
      return true;
    },
    snapshot() {
      prune();
      const counts = {};
      for (const visit of visitors.values()) counts[visit.country] = (counts[visit.country] || 0) + 1;
      return { countries: counts, activeVisitors: visitors.size, updatedAt: new Date(now()).toISOString(), windowSeconds: WINDOW_MS / 1000 };
    }
  };
}
module.exports = { createTracker, cloudflareVisitor, WINDOW_MS };
