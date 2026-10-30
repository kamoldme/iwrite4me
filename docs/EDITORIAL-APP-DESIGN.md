# Editorial app refinement — staging

## Direction

The light interface is a writing workspace: neutral paper, dark ink, restrained forest-green actions. The activity chart retains its dark glow; light mode uses restrained chart fills. Both themes show the circular daily-goal dial: amber on dark, sage on white with a centered, subtle gradient. All are driven by existing saved-document data.

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
- Task surfaces use 8–12px radii, modest borders and no decorative card glow. Empty states are compact and aligned with the content.
- Sessions use denser cards or the existing list option. Friends has a horizontal search/add area. Settings groups media above account fields. Support separates the inbox and composer. Privacy keeps its contents navigation. Plans use a responsive two-column comparison that stacks below 960px.
- Non-editor windows share typography, controls and surface tokens. History drawers translate completely off-screen, including their shadow, when closed. Existing menu/dialog actions remain.

## Implementation boundary

`app-editorial.css` is a final app-only layer. Theme-specific dashboard rules retain the amber dark dial and provide a separate sage light palette. Changes to `workspace-pages.js` move the existing discovery rail after the feed, provide keyboard activation for article cards, and replace the subscription-history emoji with a small SVG. The daily-goal renderer supplies one CSS progress value.

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
