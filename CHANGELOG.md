# Changelog

## [3.1.5] - 2026-06-15

### Changed
- Dashboard greeting ("Good evening, …") now uses Instrument Serif — a more elegant, high-contrast editorial serif that pairs with the Instrument Sans body font (section titles still use Fraunces).

## [3.1.4] - 2026-06-15

### Changed
- Dashboard Achievements panel now shows two columns (4 per swiper page, 2×2) instead of a single column; collapses to one column on narrow viewports.

## [3.1.3] - 2026-06-15

### Fixed
- Writing Tree was invisible: the dashboard repaint guarded the tree draw on `window.TreeRenderer`, but `TreeRenderer` is a top-level `const` (not on `window`), so the guard was always false. Reference it directly now.

## [3.1.2] - 2026-06-15

### Changed
- Community, Friends, and Analytics no longer re-fetch on every visit. They load once and the rendered view is reused on subsequent visits; they only re-fetch when there's actually something new:
  - **Community** refreshes when the 10s poller detects newly published posts (the same signal as the green "new" dot), plus your own story actions and the manual refresh still update it immediately.
  - **Friends** refreshes when a new friend request arrives (and friend actions still refresh it directly).
  - **Analytics** refreshes only when your writing stats change (after completing/affecting a session), detected on the next dashboard load.

## [3.1.1] - 2026-06-15

### Fixed
- Faster dashboard load / less "everything is 0 and blank" flash: the user and documents are now fetched in parallel (was sequential), user-driven visuals (stats, level bar, achievements, tree, empty heatmap grid) paint as soon as the user loads instead of waiting for documents, and the dashboard paints instantly from a cached copy of the user on repeat loads.

## [3.1.0] - 2026-06-15

### Changed
- The "Writer's Desk" dashboard structure is now shared by **all** themes — polaroid hero, horizontal stat+level bar, the 2×2 grid (Writing Activity, Today's Progress + Reflection, Writing Tree, Achievements swiper), footer quote + stamp, and no Recent Sessions card.
- **Light** mode now uses the warm parchment palette (the former Test look) and keeps the name "Light". **Dark** and **Sepia** get the same structure with their own colours.
- The separate "Test" mode is folded into Light; the theme cycle is now Dark → Light → Sepia. The structure is variable-driven (`--accent-rgb` / `--ink-rgb`) so each theme colours it.

## [3.0.46] - 2026-06-15

### Changed
- Test Mode polaroid now shows today's daily emoji as a large photo (the "today's pages" caption was removed).
- Test Mode row 2 rebalanced: the Achievements panel is wider and the Writing Tree is smaller.

## [3.0.45] - 2026-06-15

### Changed
- Test Mode dashboard relaid out as a 2×2 grid: Writing Activity beside the combined Today's Progress + Reflection panel (equal height), and the Writing Tree beside Achievements (equal height, one row). Recent Sessions removed from the Test Mode dashboard.
- Today's Progress and Reflection Prompt are now a single panel.
- Achievements shows three at a time per page, each with a circular progress indicator (check when complete, clock while in progress); pages are swipeable with dots.
- When an announcement is showing, the greeting card is now the wider of the two (announcement panel narrower).

## [3.0.44] - 2026-06-15

### Added
- Sidebar is now collapsible on desktop (all themes): the **×** in the sidebar header hides it and a floating menu button brings it back; state is remembered.
- Edit Goal now opens an in-app modal to set the daily word goal (replaces the browser prompt).

### Changed
- Test Mode dashboard refinements: single **Start Writing** button in the hero; announcements moved below the greeting; **Today's Progress** lost its title and is vertically centered; the writing-tree canvas now scales to its column (no more clipping/off-centre); the polaroid is larger and its photo emoji rotates daily; the handwritten hero quote was removed.
- Test Mode **Reflection Prompt** moved directly beneath Today's Progress, with a larger prompt and no helper caption.
- Test Mode **Achievements** is now a swiper/pager covering more milestones — in-progress ones shown first, a clock icon for unfinished/in-progress and a check for completed.

## [3.0.43] - 2026-06-14

### Changed
- **Test Mode** now restructures the dashboard layout (not just colors) to match the "Writer's Desk" reference: hero gains a polaroid + handwritten quote and a New Session button; the four stat cards collapse into a single horizontal bar with the level progress inline; a "Today's Progress" word-goal ring joins the activity/tree row; and a new row adds a Reflection sticky-note and an Achievements panel, with a closing quote and a "Write · Reflect · Grow" maker's stamp. All scoped to Test Mode only — other themes keep the original layout.
- Today's Progress ring and Achievements are driven by real data (today's words vs an editable daily goal; streak/word milestones). Reflection prompts cycle through a set via the "New Prompt" button.

## [3.0.42] - 2026-06-14

### Added
- New **Test Mode** theme — a warm cream-parchment "Writer's Desk" look with forest-green accents, an elegant Fraunces serif for headings, paper-grain texture, and softly rounded cards. Toggle through themes in the sidebar: Dark → Light → Sepia → Test → Dark.

### Fixed
- Theme persistence: `sepia` (and the new `test`) themes now restore correctly on reload — previously any non-light theme silently reverted to dark on refresh.

## [3.0.41] - 2026-05-08

### Security
- Login rate-limiting tightened from 20 attempts / 15 min to **5 / 15 min** (with skipSuccessfulRequests so legitimate users aren't punished)
- Registration rate-limiting added: **5 accounts / hour** per IP
- Email format validation on registration via `validator.isEmail()`; emails normalized (lowercase + trim) so case variants can no longer create duplicate accounts
- Password minimum bumped from 6 → 8 characters; added a small common-password deny-list (`password`, `12345678`, `iwrite4me`, etc.)
- `helmet` middleware enabled with a CSP that allows the third-party services the app actually uses (Google Tag Manager, Google OAuth, Stripe, Google Fonts); also enables HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- `x-powered-by: Express` header removed
- JWT lifetime reduced from 7 days → 2 days
- One-shot cleanup script added (`server/scripts/cleanup-pentest-accounts.js`) to remove test accounts created during the security audit; run with `railway run node server/scripts/cleanup-pentest-accounts.js`

## [2.3.9] - 2026-03-23

### Changed
- Stories feed redesigned with featured hero card (top story from last 7 days by popularity) and content-first card layout
- Story reader now uses editorial serif typography (Georgia, 20px, 1.7 line-height, 680px max-width) for a Medium-like reading experience
- Story composer toolbar replaced with floating selection toolbar that appears on text selection — includes Bold, Italic, Link (inline URL input), and a Format dropdown (Normal/H1/H2/H3/Blockquote/Lists)
- PRO badge in story author row extracted from inline styles to `.pro-nav-badge` CSS class (DRY fix)
- Responsive breakpoints added for mobile (<768px, 44px touch targets) and tablet (768-1024px, 640px max-width)

### Added
- Skeleton loading cards replace spinner while Stories feed loads (3 pulsing placeholder cards)
- Bottom action bar in story reader (like/comment/share) duplicated below content, synced with top bar
- Bottom action bar added to public story page (`/story/:id`)
- Format dropdown in composer: Normal text, Heading 1-3, Blockquote, Bulleted list, Numbered list

### Removed
- Font selector removed from story composer
- All color picker buttons removed from story composer
- Side metrics panel removed from feed cards (metrics now inline in card footer)
