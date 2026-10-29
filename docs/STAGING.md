# Isolated iWrite staging

URL: https://iwrite-staging.169.58.74.77.sslip.io/app
Branch: staging/new-features

## Baseline and isolation
On 2026-10-29, staging was reset to a source snapshot of the **running production container**, not an older Git branch. Commit `4643c666` records that source baseline. The captured root filesystem image is `iwrite4me:staging-production-baseline-20261029`. Its imported configuration does not inherit production secrets or Traefik labels.

The PostgreSQL 18 database was copied with a read-only pg_dump and restored into a new PostgreSQL container. Images in profile_media were included. Existing account password records were compared after restoration: all 667 matched production. Staging startup skips production's admin-password reset so copied credentials stay intact.

- App container: iwrite-staging-20261029
- Database container: iwrite-staging-db-20261029
- Database: iwrite_staging
- Database network: iwrite-staging-private (no published database port)
- Database volume: iwrite-staging-db-data
- Proxy network: coolify, with hostname-specific staging labels only
- Root-only deployment files and dump: /srv/iwrite-staging-20261029 (700 directory, 600 secret files)

The app has its own JWT secret and database credentials. Production API keys are not copied. STAGING_MODE=1 blocks payment and outbound-email auth actions and adds X-Robots-Tag: noindex, nofollow, noarchive. Telegram and Stripe reconciliation are disabled by missing credentials. Google sign-in is disabled; email/password login uses the copied account hashes.

A staging-only preview account contains seven labeled sample sessions for visual review. Its credentials are supplied privately to the requester and are not in the repository. Those sample rows do not exist in production.

## Visual experiment
Only the dashboard gets the glowing widget treatment. New CSS and JavaScript are loaded by app.html and scoped to #view-dashboard and its app-container. The editor is a sibling of the app-container and retains production markup, styles and editor.js. The landing page retains the exact production source.

The reference's SVG glow, rounded outlines and dial geometry are adapted to real saved-session counts and goal progress. No simulated live data, music controls, autonomous chart scroll or thermostat values are shipped. The preview account's sample data is explicitly labeled.

The calendar's local-day keys and the header's loaded daily-word count are aligned with the dashboard data. No session timer, editor, quota or payment logic is changed.

## Deployment and recovery
Do not copy production env files or routing labels. Do not point staging at the production database. Do not refresh the data snapshot without an explicit request, since that replaces staging experiments.

The current hosted deployment is a separate snapshot container with only the staging source changes overlaid. A saved image of the staged result is retained on the host. Restarting this container does not touch production, and its database volume survives app-container replacement.

To deploy new staging source, build from staging/new-features or overlay the reviewed staging files on the staging container only. Keep STAGING_MODE=1 and the root-only staging env file. Confirm the target container name before copying files. A new app container must connect to iwrite-staging-private and coolify, use the dedicated staging hostname labels, and use the staging database env file.

## Verification
- HTTPS verified in browser; actual email/password login succeeded using the staging preview account.
- Populated and empty dashboard rendering inspected; 7/30-day selector tested, goal percentage checked, and no tile overlap/horizontal page overflow at 1440px and 1024px.
- Payment POST returned 403 and noindex response header was verified.
- Production's protected landing/editor/style file hashes compared against the captured baseline.
- Production original banner check: 29 of 30 referenced banner URLs returned valid images; @akb's original file was absent from filesystem, migration archives and available deployment containers. It was not replaced with another image.

### Dashboard refinement (2026-10-29)
The follow-up dashboard refinement is documented in `docs/DASHBOARD-DESIGN.md`. Browser checks passed for the 7/30-day selector/data table, goal editing, local-midnight totals, deleted-document exclusion, safe document titles, empty states, keyboard session readouts, navigation and opening a recent document. Desktop layouts were inspected at 1440, 1024 and 800px without horizontal overflow. The existing phone gate is retained.

The seven staging preview documents were completed with empty `shareLinks` arrays, which the existing document-view route requires. This sample-only data repair did not change copied user documents or production.

### Sidebar and session picker (2026-10-29)
The staged app shell now uses one dark navigation surface across app views. Icons keep a fixed horizontal position, labels fade, and sidebar width/content margin share a 240ms transition. The obsolete body-level full-hide state was removed from desktop controls; all desktop toggles share the rail preference. Restoration does not animate until the first user toggle. Reduced motion disables transitions.

The pre-session picker retains all existing mode, timer, quota and start actions. Native mode buttons expose pressed states. Hover uses image scale and an outline, with no sibling blur/dimming. The dialog supports Escape, focus containment/return and an animated exit. Laptop-height layouts keep the start action visible while the detail panel can scroll.

Browser verification: 19 sampled collapse frames, zero pixels of icon travel, content/sidebar alignment within one pixel, rapid reversal, saved preference, all four modes, keyboard focus and animated exit passed. No writing session was started by these checks. Visual checks at 1280x720 and 1024x768 kept the start button inside the viewport and showed no page overflow. Landing/shared style/editor hashes and the editor HTML region remain identical to the production baseline.
