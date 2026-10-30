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

### Shared app surfaces, light mode and typography (2026-10-29)
App chrome now has namespaced dark/light tokens. The existing theme toggle and saved preference select the palette. Light mode uses pale green-white surfaces, deep green actions, amber goal and iris rhythm widgets, with theme-specific text/border colors. Theme switches suppress app-only transitions for two frames to prevent color smearing.

The shared treatment covers document/folder/export context menus, dashboard/community notifications, the lobby popover, goal/share/friend/profile/follow/daily-limit dialogs, pricing/payment-choice windows, announcements, help and streak windows. Native selects keep platform keyboard/popup behavior. Dynamic context menus use the same surface and control tokens.

Fonts: Archivo for app headings, Instrument Sans for interface text and controls, DM Mono for compact dates/data. Existing font assets are reused. Brand marks and author-formatted content are not replaced. The app-container owns typography variables; the editor is its sibling. Body-mounted non-editor window styles are additionally gated off whenever the editor is active. Completion/title, editor tools, focus/audio menus, research and writing controls are excluded.

Browser checks passed in both themes for sidebar/menu/dialog/picker colors, heading/control font roles, mode selection, existing theme-toggle persistence, and editor font/style isolation when opening a saved document. Earlier sidebar motion/keyboard checks remain applicable. Existing Google-config and YouTube CSP errors come from the unchanged production baseline; they are not new UI errors.

### Sidebar structure redesign (2026-10-29)
The sidebar was rebuilt around Workspace/Connect groups, a writing shortcut, new consistent SVG icons, a distinct subscription row, and an anchored account/streak area. All original sidebar IDs, destinations, badges, conditional entries and handlers remain. The expanded width is now 264px; the compact rail remains 68px. Design and feature verification are recorded in docs/SIDEBAR-DESIGN.md.

### Destination-page formats (2026-10-29)
Sessions, Community, Leaderboard, Friends, own/public Profile, Settings, Support and Privacy now have distinct page structures. Existing controls are moved rather than replaced, preserving IDs and handlers. The provided up-right image replaces font-glyph arrows through a theme-aware mask. Feature inventory, scope and verification are recorded in docs/WORKSPACE-FORMATS.md.

### Editorial light-mode refinement (2026-10-29)
This supersedes the earlier pale-green/glowing light palette and 264px sidebar specification above. Light mode now uses neutral paper surfaces, solid chart fills, a compact daily-goal bar, and a 240px expanded sidebar. Community uses an article-first list with discovery in a supporting margin. The pass also tightens task-page layouts, control alignment, empty states, typography and non-editor windows; closed history drawers are fully hidden. Dark dashboard glow remains available. See `docs/EDITORIAL-APP-DESIGN.md` for design references, scope and the functional/responsive checks. Production, landing and the writing space are unchanged.

### Session paper and workspace tools (2026-10-30)
The session design is now explicitly in scope of the staging experiment. `session-workspace.css` owns its visual overrides; the landing and the shared production stylesheets remain unchanged. The earlier editor-preservation rule above describes the initial experiment, not this newly authorized session UI pass.

- Formatting is inside the writing column. The Tabs rail meets navigation even while formatting fades; fading keeps the paper position stable.
- The desk scrolls independently around a square-cornered, A4-width sheet with a subtle local SVG grain. Longer text flows continuously; this is not print pagination. Authored fonts, colors and formatting remain intact.
- Research is inside the editor body, beneath full-width navigation. Wide screens reserve a column; smaller screens use a right overlay. Closed research is inert. Search, source details, AI history and quota behavior are retained.
- Portalled workspace tools, focus and sound menus use the app theme, actual trigger geometry and bounded scrolling. Tools support arrow-key navigation and Escape. Sound tracks, volume, typewriter packs and YouTube controls retain their existing handlers.
- Tab-away, Leonidas startup, duel countdown, title/save, completion and failure surfaces share the palette. The visible tab-away notice contains only a number and “seconds”; its accessible label retains the consequence. Countdown numerals no longer pulse. Returning in time confirms that writing is safe, rather than showing a stale deletion countdown and randomized alarm copy.
- The authorized `editor.js` exception updates return-notification presentation (including suppression after an ended session), closes portalled controls during cleanup, and reuses/prepares audio players. Interval duration, grace-period arithmetic, expiry abandonment, hearts, deletion, completion, autosaving and persisted session state are unchanged.

Verification: JavaScript syntax and whitespace checks passed. Browser checks passed in both themes at 1440×1000 and 800×900 (79 assertions per width): rail geometry during idle fade, paper bounds, portal placement/colors, sound options, research docking and pane switching, inert close state, keyboard dismissal, countdown/title surfaces, and unchanged saved content. Real countdown methods were invoked on isolated fixtures with a stubbed abandonment method: expiry still calls abandonment, while returning cancels the interval and refreshes the timer. No live writing was deleted and no test session was saved. AI answer generation was not changed or integration-tested. The original audio recordings and URLs are retained; preparation and playback state are covered below.
The actual idle interval was also exercised with temporary Zen-mode state and no session start: controls hid, the rail stayed aligned, and mouse movement restored the controls. Back navigation still closed the saved-document viewer. Browser screenshots were reviewed for desktop tools, research in both widths/themes, ambient controls and the protection notice.

Follow-up refinements: neutral focus-switch and toast colors; portal colors persist outside the active editor; failure/cleanup/Back dismiss tools, audio, focus, add-time and selection controls. Sound sections use one divider, target words uses “##”, the library heading shares the folder icon, and list rows have a 76px minimum height with centered mode controls.

Audio preparation starts during app idle and on opening sound controls; hover/focus prepares the chosen track. Player instances and their buffers survive pause/stop. The UI shows loading until playback actually starts, supports cancellation, and ignores stale play promises after switching/stopping. Five regression tests in `tests/editor-audio.test.js` cover those asynchronous cases. Additional browser checks passed for the follow-up surfaces and media lifecycle (34 assertions per viewport at 1440×1000 and 800×900, covering both themes). A real streaming test measured a 2.632s first Lofi start and 22–53ms buffered/resumed starts before moving metadata preparation earlier. This does **not** establish a one-second cold-start guarantee: Archive.org and YouTube still determine initial network availability. No recordings were replaced or truncated.

### Notifications, publishing, motion and paper zoom (2026-10-30)
The notification feed now starts after the one-time reset at `2026-10-30T16:15:34Z` and expires entries seven days after creation. `notification-policy.js` applies the same policy to the list and unread counts; the open bell refreshes at its next expiry. The bell requests current announcements rather than their archive. Archived source records remain available through the existing History feature. The empty state reads “No notifications.” and is centered. Closed notifications are inert, dismiss with Escape and retain a short exit transition.

Sidebar collapse changes the page layout once and animates the main content's visual offset for 220ms; it no longer transitions the dashboard margin every frame. Rapid reversals cancel and retarget the active offset. The theme button uses a 1.4s circular View Transition from the control to the farthest viewport corner. Appearance controls and the session menu use the same flow. Unsupported browsers and reduced-motion preferences change theme immediately, and repeated clicks settle on the latest requested theme.

Sessions search and Cards/List controls share a 40px height. The create-folder plus is 14px; the rank percentile gets an additional 20px margin beyond the row gap.

“Publish a session” opens a searchable, paginated native dialog containing the writer's saved sessions. Selecting one calls the existing authenticated from-document endpoint, which creates a private draft with the source title and sanitized writing. The composer opens for review; submission/publication still requires the writer's action. Drafts use compact single-column rows, 12px gaps and aligned status/actions. Unpublished drafts omit zero audience counters.

The session toolbar adds − / percentage reset / + controls for 50–200% paper-only zoom. `paper-zoom.js` scales the paper inside a measured scroll stage and keeps the horizontal viewport center stable; zoom changes now return to the paper’s top edge beneath any visible formatting bar. Other interface dimensions, authored font settings and saved content are unchanged. Leonidas uses “START WRITING”; its startup background is blurred. The danger progress indicator is a 3px header rail, with the existing hearts moved into navigation. Timer, heart/deletion and save logic are unchanged.

Verification: 58 browser assertions passed at each of 1440×1000 and 800×900, covering both themes, control geometry, notification empty/exit states, sidebar reversals, paper zoom and formatting preservation, danger geometry and actual View Transition origin/duration/fallback. The session-to-draft flow passed 28 browser checks, including search, paging, escaped titles, cancel-without-create and an actual private draft copy. Only that test-created draft was removed afterward. Ten local-render fixture checks cover formal draft spacing/actions in both themes. Four notification policy boundary tests and five existing audio lifecycle tests pass and run in staging CI. Repeated live read checks briefly hit the unchanged 120/min staging rate limit; the narrower follow-up checks used memoized read responses inside the QA browser to avoid further repeated requests. Production and server rate limits were not changed.

## Session toolbar and paper zoom follow-up

The +5-minute confirmation places its question above two compact 36px actions. The timer visibility button is 44px wide and the +5m label is 13px. Zoom changes align the paper's top beneath visible formatting controls while preserving horizontal centering.

Verification: 32 browser assertions passed at each of 1440×1000 and 800×900, covering both themes, popup and toolbar geometry, Cancel and the existing add-five-minute handler, top anchoring with formatting shown/hidden, zoom out and unchanged authored content/font and toolbar height. Checks used a saved preview document with simulated timer controls and intercepted add-time calls, without starting a live session. Light and dark screenshots were inspected; nine existing audio/notification tests and JavaScript syntax checks pass.

## Paper spacing, lighter theme transition and search surface

Paper zoom preserves the stage's existing CSS top margin (28px on desktop, 16px at the compact breakpoint) below the formatting bar or navbar. Both zoom directions and percentage reset keep that gap after scrolling.

Theme changes now fade the new composited snapshot over 280ms instead of expanding a full-screen circular clip over 1.4 seconds. The group has no extra animation; per-element color transitions remain suppressed during the switch. Rapid reversal, reduced-motion and unsupported-browser fallbacks are retained. Light-mode session search uses the white surface token while dark mode retains its existing forest fill.

Verification: 46 browser assertions passed at each of 1440×1000 and 800×900, covering both themes, white/dark search fill and focus indication, actual +/−/reset clicks from a scrolled paper with formatting visible and hidden, preserved margin/content/font/toolbar geometry, the real 280ms opacity-only View Transition, rapid reversal and reduced-motion/unsupported fallbacks. Screenshots of the paper gap and white search were inspected. JavaScript syntax and whitespace checks pass. No live session was started or saved, and production was not changed.

## Sound studio and session layout follow-up

Ambient sound rows have 10px vertical/12px horizontal padding and more separation. Pink Noise is a generated, locally hosted 30-second PCM loop with short edge fades; it uses the existing shared volume, pause/resume and stop lifecycle. Its generation command and provenance are in `public/media/ambient/README.md`. Existing external recordings remain unchanged.

YouTube's IFrame API was blocked by the top-level script CSP, despite embeds being allowed. The policy now permits the API and player script hosts. Startup uses one shared, bounded API promise and a player-start deadline instead of polling forever. URL parsing accepts common watch/share/live/shorts/embed video links and rejects lookalike hosts. Pending starts cannot revive after stop/track changes. Playback state follows player events, including blocked autoplay and unavailable/restricted videos. The visible 200px player and status provide a manual-play fallback; slider widths are constrained and the player scrolls into the sound menu's view. The implementation follows the official IFrame API reference: https://developers.google.com/youtube/iframe_api_reference .

Formatting stays pinned horizontally as well as vertically while the paper scrolls. Research remains docked beside the writing area, narrowing to 280px at smaller desktop widths instead of covering formatting controls. The three-dot menu adds a Pageless view preference, persisted in local storage: it resets zoom to 100%, fills the writing width and removes A4 height, texture, shadow and background. Returning to A4 restores the paper layout; authored content/font and save/timer/danger behavior are unchanged.

The shared confirmation now uses app light/dark tokens even while session chrome is active. It has compact actions, focus containment, Escape cancellation and focus restoration. Community's page heading is now 40px.

Verification: 56 browser assertions passed at each of 1440×1000 and 800×900 across both themes, including horizontal/vertical scroll with Research open/closed, visible formatting controls, A4/Pageless geometry and unchanged content, sound padding, actual Pink Noise playback/pause/resume/volume, themed confirmations and keyboard cancellation, and Community heading size. A real YouTube video reached player state 1 (Playing), with a 200px visible iframe and contained seek/volume controls. Light/dark sound, confirmation, Research, Pageless and Community screenshots were inspected. Sixteen audio/YouTube/notification tests pass, including API error/timeout retry, stop-during-load and stale event protection. No live writing session was started or saved. Deployment targets only the staging app container; production and landing source are unchanged.
