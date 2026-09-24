# Public activity map

The landing page map highlights countries with website activity in the preceding five minutes, refreshed every 30 seconds. Hovering or focusing a highlighted country shows its approximate visitor count. LIVE pulses only after a fresh successful response; failed refreshes show RECONNECTING.

Visitors are deduplicated by a process-keyed HMAC of their network address and browser user-agent. Only that signature, country and last heartbeat timestamp are kept in memory. Entries expire after five minutes; restarting the server clears them. No persistent browser identifiers or precise locations are collected. Shared networks and browser changes mean these are approximate counts, not audited unique users. Known bot agents and unknown countries are omitted. Capacity is capped at 20,000 recent signatures.

Country headers are accepted only from Cloudflare ranges through the existing one-hop reverse proxy. Direct or untrusted requests cannot supply a country. The heartbeat requires a same-origin Origin header. Both endpoints have visitor-aware rate limits; the public aggregate response contains no visitor identifiers. Deployment must verify that Cloudflare IP geolocation is enabled and the proxy chain matches this configuration.

Boundaries are Natural Earth's public-domain 1:50m country dataset, rendered locally with an Equal Earth projection. No external map service is loaded. Rebuild with `python3 scripts/build-world-map.py /path/to/ne_50m_admin_0_countries.geojson`. Source: https://www.naturalearthdata.com/about/terms-of-use/ and https://github.com/nvkelso/natural-earth-vector .
