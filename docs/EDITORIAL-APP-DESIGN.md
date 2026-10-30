# Editorial app refinement — staging

## Direction

The light interface is a writing workspace: neutral paper, dark ink, restrained forest-green actions. Activity and session charts use a consistent moss accent with restrained fills in both themes. Both themes show the circular daily-goal dial: amber on dark, sage on white with a centered, subtle gradient. All are driven by existing saved-document data.

Community prioritizes reading. One article column presents byline, title, serif excerpt and metadata; discovery sits in a quieter right margin. At 1100px and below discovery follows the articles, preserving reading width. Feed and reader continue to use the original story actions and data.

References consulted, not copied as dependencies:

- [Medium's writing feed](https://medium.com/tag/writing): article hierarchy and restrained metadata.
- [Primer patterns](https://primer.style/product/ui-patterns/) and [source](https://github.com/primer/css): consistent control geometry and functional surfaces.
- [NN/g on empty states](https://www.nngroup.com/articles/empty-state-interface-design/): small, useful guidance instead of oversized decorative cards.
- [Impeccable](https://github.com/pbakaus/impeccable): intentional hierarchy, content-led layouts and reduced visual noise.

Installed UI Skills routing, Interface Design, Better UI and Impeccable informed the pass. No third-party frontend package or remote runtime was added.

## Rules

- Light palette: page `#fafaf8`, sidebar `#f6f6f3`, white surface, ink `#242923`, secondary text `#60675e`, accent/action `#246244`.
- Archivo for headings, Instrument Sans for controls/body, Georgia for Community excerpts and reflection prompts. Existing authored story and writing typography remains intact.
- 30px page titles, 25px article titles, 14–15px controls/body, 12–13px metadata; secondary text uses a solid color, not faded opacity.
- Sidebar: 240px expanded, 68px rail; fixed icon column, flexible ellipsized labels, consistent full-width buttons. Existing collapse motion and reduced-motion behavior retained.
- Cards, panels, picker tiles and app windows share the 28px surface radius from Session momentum. Small controls use 8–12px radii; circular avatars, indicators and flat article/table rows keep their functional geometry. Surfaces use modest borders and no decorative card glow. Empty states are compact and aligned with the content.
- Sessions use denser cards or the existing list option. Friends has a horizontal search/add area. Settings groups media above account fields. Support separates the inbox and composer. Privacy keeps its contents navigation. Plans use a responsive two-column comparison that stacks below 960px.
- Non-editor windows share typography, controls and surface tokens. History drawers translate completely off-screen, including their shadow, when closed. Existing menu/dialog actions remain.

## Implementation boundary

`app-editorial.css` provides app-only styling; `app-surfaces.css` is the final shared geometry layer. Theme-specific dashboard rules retain the amber dark dial and provide a separate sage light palette. Changes to `workspace-pages.js` move the existing discovery rail after the feed, provide keyboard activation for article cards, and replace the subscription-history emoji with a small SVG. The daily-goal renderer supplies one CSS progress value.

Community photos that fail to load use name initials locally; working photos and stored profile data are unchanged. Pro badges use the action/background contrast pair in each theme.

No backend, authentication, payment, timer, quota or persistence logic changed. Landing files, shared production styles, editor.js and the editor HTML region match the protected baseline. No database migration or production deployment is part of this change.

## Verified on isolated staging

- Both themes: all ten navigation destinations, active state, expanded/collapsed rail, accessible icon names, session shortcut, Escape/focus return, account keyboard action, streak and original badges.
- Sessions: search, card/list toggle, all mode/folder filters, document actions and history.
- Community: Feed/My Stories, Following and status filters, original reader, and Enter on article cards.
- Rankings: four metrics and pagination. Friends: add controls, sorting and activity. Profiles: About/Posts, followers and Edit Profile.
- Settings: categories, keyboard navigation, theme persistence, retained unsaved fields and canceling account deletion. Support: existing form/attachment/inbox controls, without submitting a ticket. Privacy: all 11 sections and contents navigation.
- No horizontal page overflow or clipped controls at 800px and 1024px across the main destination pages in both themes; the plan page was also checked at 800px. Existing phone gate remains.
- Goal, limit, payment-choice, history and mode-picker windows fit an 800×900 viewport in both themes. Closing history removes its visible edge. No payment or writing session was submitted.
- Goal dial matches the original word/goal data in both themes; the light activity chart has no blur. Existing theme and editor font isolation checks pass.
- Visual review at 1440px, 1024px and 800px; JavaScript syntax and Git whitespace checks pass.

These are focused functional and visual checks, not a claim of a full accessibility or every-account-state audit. The preview account's labeled sample documents are staging-only; they are not production activity.

## Dashboard and picker refinement — October 30

- Four existing metrics now use larger tabular numbers and compact document, calendar, flame and star icons. Two columns below 1100px keep labels readable.
- Session momentum replaces the floating waveform with a dated line chart, a word-count scale and an average for up to 20 saved sessions. Focus, pointer and arrow/Home/End keys inspect individual values. Empty and single-session data have explicit representations; no generated values are introduced.
- Light mode restores the circular goal dial with sage ticks, dark-green numerals and a soft centered surface gradient. The existing goal action and calculations are retained.
- The picker places allowance/reset text beside “How long” in a shared heading. Keeping it outside the mode-specific duration container preserves visibility in Zen and Duel. Tab-timer presets, including the custom control, share five equal columns; Pro restrictions remain unchanged. On short laptop screens, the explanation scrolls independently so timer controls stay visible.
- Browser checks cover empty/zero/single/20-session charts, document exclusions, averages, pointer and keyboard selection, 0/50/100% dial states, editing the goal and all four picker modes in both themes. Fixtures were in-memory only and restored afterward.
- Visual checks at 1440×1000, 1024×900 and 800×900; picker checks also at 1280×720. All five tab controls stay aligned and visible on the short laptop layout. Protected landing/editor hashes and editor markup match the baseline.

## Shared surfaces and landing logo — October 30

`--app-panel-radius: 28px` controls app cards, panels, menus and non-editor dialogs in both themes. Explicit surface selectors avoid rounding controls, chart marks or flat content separators. Radius-only priority handles legacy theme/inline rules without changing their behavior.

The dashboard uses a real flex stack for goal/reflection opposite the session panel. Both columns stretch to the same grid row, so their top/bottom edges stay aligned even with longer reflection text. Below 960px they stack naturally; the activity/tree row also stretches to a common bottom edge when side by side.

The sidebar and phone-gate mark use `/media/iwrite-logo.png`, matching the live landing page. The sidebar no longer inverts the asset in dark mode.

Verified in both themes at 1440, 1024 and 800px: shared dashboard radii, matching desktop column edges, long-reflection expansion, stacked narrow layout, goal/picker window corners, no horizontal overflow and an unfiltered loaded logo. A surface inventory covered the ten main app destinations. Protected landing/editor assets and editor markup remain unchanged.


## Reference-video refinement — October 30

The supplied Tobi before/after clip is a silent visual demonstration, not a narrated specification. Its explicit annotations show irregular gaps being normalized, gradient palettes replaced by ink/moss/semantic accents, emoji replaced by simple marks, and heavier typography replaced by larger, lighter numerals with quieter labels. The final view adds factual context to its charts.

Applied to the existing iWrite dashboard:

- Remove the blurred duplicate activity-chart stroke and page-level ambient gradient. Keep the real dated series, readable points, range selector and accessible daily-value table. Point and guide colors now work in both themes.
- Use the same moss accent for activity, session momentum and achievement progress. Reserve amber for goals/streaks; remove the unrelated blue/purple metric accents. Keep subtle chart fills and the specifically requested sage/amber goal dial.
- Keep Instrument Sans/Archivo and the existing serif reflection rather than importing a new font solely to copy the example. Use lighter-weight primary numerals and quieter chart headings, with consistent secondary text colors.
- Replace achievement clock emoji with milestone-specific line icons and completed checkmarks. Preserve measured progress, labels, paging and milestone criteria. Recent-document arrows retain the existing shared icon treatment.
- Preserve the approved 28px surfaces and aligned column structure. Suppress an empty notification banner without hiding real messages.

This is a focused refinement of the current design, not a layout reset. No new metrics, simulated activity, dependencies or backend behavior were introduced. Production, landing and the writing editor remain outside the change.

Verified on staging: both themes at 1440, 1024 and 800px; shared corners and column alignment including long reflection text; chart empty/single/20-session data, pointer/keyboard inspection; goal states/editing and picker controls; achievement paging and completed/incomplete SVG states; blank versus populated notification visibility. Updated secondary text measures 5.83:1 against the light session panel and 10.14:1 against the dark panel. JavaScript syntax, whitespace, protected asset hashes and editor-markup isolation checks pass. This is a scoped dashboard verification, not a full-platform accessibility certification.

## Appllama guidance — October 30

Sources: [Appllama](https://appllama.io/) and [Appllama skills](https://github.com/Appllama/appllama-skills). Installed `appllama-app-design-skill` v1.3.0 and `appllama-usage` v1.1.0 in the local Codex skills directory. The research connector is not connected: this pass uses the public catalog and the skill text, and does not claim a paid-library benchmark study.

Adopt the principles that fit this web product: semantic theme tokens, a single action accent, deliberate shape/spacing scales, one label per intent, consistent line icons, visible focus, usable targets, real data and complete interaction states. Native-only Expo/React Native APIs and simulator requirements are not dependencies or a reason to migrate the existing stack. Browser interaction checks replace native simulator checks here; no mobile frame-rate claim is made.

Keep the approved 28px panel radius, 12px primary-action radius, existing smaller fields and circular indicators. Amber remains a deliberate exception for the specifically requested goal/streak treatment; mode illustrations retain their existing identities. The landing, active editor and backend remain excluded.

This pass resolves verified inconsistencies: dashboard/sidebar/library and normal/Zen picker actions now use “Start writing” (uppercase where already requested), their primary colors and hover colors use shared tokens, and keyboard focus on the activity table is visible in either theme. The explicit danger acknowledgment and opponent search retain their distinct wording. Achievement arrows use matching SVGs and 44px targets, with expanded pagination-dot hit areas. No session is started by these design checks.

Verification: both themes at 1440px and 800px; shared primary colors and ≥4.5:1 button text contrast; ≥3:1 focus outline contrast; 44px achievement-arrow targets; activity table open/close; all four picker labels and Escape dismissal; library action, shared panel corners and aligned columns. Protected landing/editor hashes and editor HTML region are unchanged. The existing sidebar collapse geometry is checked separately from the expanded state.

## Paywall offer clarity — October 30

Reference: [Jaimin's paywall article](https://x.com/jaimintf/status/2115135943720255985), “HOW to make your paywall look & feel 10X better.” Read via its public article payload because X returned 403. Applied clear benefits, upfront terms, consistent selection and easy dismissal; no conversion-uplift claims or fabricated social proof.

- Retained the Free/Pro comparison, all features, three durations, prices, History and Manage Billing.
- The page action names the selected duration. Eligible trials have a keyboard-accessible button and explicit $0 today / seven days / selected renewal charge / cancellation terms.
- The payment window shows a full-amount summary beside the next action, and updates duration prices, provider, total and terms together. Stripe is recurring; Click grants 30/90/180-day passes with no auto-renewal, matching server code. Removed unsupported “Popular” and “Best value” labels from the chooser.
- Added pressed states, focus retention, a dialog focus loop, Escape and return focus. Checkout failures restore the actual initiating control, including the trial button.
- Disabled payment continuation when no provider is available; the trial offer respects Stripe availability. Server-returned UZS prices refresh the comparison.

Validation: 66 focused browser assertions across light/dark, three durations, both provider selections, trial eligibility, current subscriber controls, dialog keyboard behavior, HTTP/network failures and unavailable providers. Provider availability/account states were temporary in-memory QA fixtures; no payments were submitted or configuration changed. Visually inspected the comparison and payment dialog, including 800px width. Staging's real payment providers remain disabled. Existing unrelated resource 500 and YouTube CSP errors remain outside this change. Landing and editor baseline hashes are unchanged.

## Geometry and density corrections — October 30

The shared 28px override had accidentally rounded a one-sided library divider and compact menus. Keep 28px for independent cards/panels/dialogs; rails are square, while payment options, settings plan strips, upload wells and compact menus use 12px. This supersedes the earlier blanket-radius rule. Avoid rounding structural separators or applying full-card geometry to small controls.

- Library empty states have separate heading/body/action spacing (10px and 18px) and bounded reading width.
- Profile facts use an unboxed label/value grid; four compact statistic cards form one row when the content area has 680px. Below that they become two columns. Achievement text wraps, uses readable sizes and stays opaque even before earning; icons/selected surfaces retain state distinction.
- Settings media panels align to their content heights. Empty banners use a 44px text area; uploaded banners retain their image preview and Remove action. No file storage or upload behavior changed.
- Sidebar uses the landing mark and Nunito 900 wordmark as one line, without the tagline; collapse behavior remains.
- Picker duration buttons, quota/reset and start share a desktop row. Removed “How long,” retaining accessible duration group names. Below 1200px durations occupy their own row, with quota and start together. All four modes retain quotas, locks and actions.

Focused checks cover both themes, library filters and empty state spacing, empty/populated banner states, compact profile cards, all four picker modes, timer locks, Escape, loaded logo and sidebar collapse. Ten destinations were inspected for overflow and rounded separators at desktop and 800px in both themes. No actual writing session, upload, deletion or payment was submitted. Changes remain staging-only and exclude the landing and writing editor.

## Folder-first library and visible paging — October 30

The library rail now contains All plus the actual folders (including nested folders), folder counts, options and a labelled folder-plus action. Removed mode/pinned/folders filter tabs from this rail as requested. All lists every visible document across folders, rather than only unfiled documents. Selecting a folder shows its direct files; breadcrumbs, nesting, rename/move/delete options and the existing Pro create-folder guard remain. Empty folders retain a useful empty state.

The existing ten-file pagination is now visible even on a single populated page, with the item range, total and page count. Temporary 23-file fixtures verified first/second/last pages, Previous, folder switching, search, hidden-document exclusion and returning to All. Free/Pro creation routes were tested with callbacks intercepted, without creating or deleting stored data. Both themes passed at 1440px (36 checks) and 800px (32 checks).

Dashboard daily quota is on the same desktop row as today's word/goal progress, below online presence. Narrow layouts stack the header. Landing and writing editor hashes remain intact. No backend or production changes.

## Folder Pro prompt — October 30

Free-account folder creation now opens a contextual dialog instead of an imperative toast followed by an automatic pricing redirect. The prompt explains folder organisation, identifies Pro inclusion and offers Explore Pro or Not now. Close, backdrop and Escape dismiss; focus returns to the invoking control. Tab stays within the dialog and the background workspace is inert while open. Only Explore Pro opens plans and transfers focus to its heading. Premium accounts retain the existing create-folder flow. Both themes use semantic tokens and 28px dialog geometry; no animation or external asset is needed.
