# Editorial app refinement — staging

## Direction

The light interface is a writing workspace: neutral paper, dark ink, restrained forest-green actions. Glowing charts and colored ambient backgrounds remain a dark-dashboard treatment; light mode uses a solid area chart and a compact progress bar driven by the same daily-goal calculation.

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

`app-editorial.css` is a final app-only layer. The light dashboard rules do not affect its dark treatment. Changes to `workspace-pages.js` move the existing discovery rail after the feed, provide keyboard activation for article cards, and replace the subscription-history emoji with a small SVG. The daily-goal renderer supplies one CSS progress value.

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
- Goal bar matches the original word/goal data; light chart has no blur or gradient. Existing theme and editor font isolation checks pass.
- Visual review at 1440px, 1024px and 800px; JavaScript syntax and Git whitespace checks pass.

These are focused functional and visual checks, not a claim of a full accessibility or every-account-state audit. The preview account's labeled sample documents are staging-only; they are not production activity.
