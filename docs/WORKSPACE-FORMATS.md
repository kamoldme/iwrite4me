# Staging destination-page experiments

The sidebar navigation and its destination pages are separate surfaces. This change redesigns the destination layouts themselves. It is limited to the isolated production-copy staging deployment; landing, timed writing/editor and backend handlers stay intact.

## Formats and retained features

| Page | New format | Existing features retained |
|---|---|---|
| Sessions | Collection rail plus a card library; optional persistent List view | Search, all seven filters, folders and breadcrumbs, shared documents, pin/move/publish/export/share/delete menus, pagination, history and new session |
| Community | Compact publishing masthead, horizontal discovery panels and a magazine reading grid | Feed/My Stories, status filters, Latest/Following/Most read controls, notifications, refresh, publish/new story actions, most-followed/top-week lists, story reader and existing author/metric links |
| Leaderboard | Personal rank/metric summary above a full-width standings board | Four ranking metrics, current-user summary, pagination and writer links |
| Friends | Connection finder beside Directory/Activity tabs; friend cards replace table rows | Add-friend form, requests, four sorts, profile/menu actions, suggestions, pagination and activity feed |
| Profile | Banner plus an identity column alongside About/Posts portfolio content | Existing avatar/banner URLs, bio, follower/following/story counts and lists, edit/follow/friend controls, stats, achievements and posts; both own/public profile variants |
| Settings | Category rail: Profile & account, Appearance, Security, Referrals | Every original field/upload/control, plan information, save action, theme/rail preferences, password reset, referral tools and account-deletion confirmation |
| Support | Ticket inbox beside a focused ticket composer | Ticket history/statuses, type/subject/message, attachment/drop/paste controls and original submit handler |
| Privacy | Contents navigation beside a readable long document | All original policy wording and eleven sections; contents navigation does not change the app route |

## Implementation boundary

`workspace-pages.js` moves the original DOM nodes instead of cloning/replacing controls. Original IDs, inputs, data containers and event listeners survive. A runtime integrity check compares ID-bearing element identities before/after the layout moves. Original app.js, stories.js and api.js are unchanged by this experiment. The new category/layout/contents controls use native buttons, explicit selected states and keyboard support.

`workspace-pages.css` is scoped to the destination views, with light/dark values inherited from the existing UI tokens. Community feed layout rules exclude its reader/composer modes. No editor selectors or root production styles are changed. Form/category changes preserve unsaved field values; leaving the Settings view follows the app's original load behavior.

The supplied `up-right.png` attachment is copied unchanged to `public/img/up-right.png`. Its alpha channel is used as a CSS mask for the sidebar and recent-document arrows, so the actual supplied shape adopts the current surface's color without a font glyph or separate recolored assets.

## Validation

- All original ID-bearing controls retained as the same DOM objects after transformation; nine view variants enhanced, including both profile views.
- Sessions: real preview documents, card/list toggle, search, every filter, document action menu and history.
- Community: feed/mine/status/following controls and existing published-story reader. No draft/story was published by QA.
- Leaderboard: all metrics and next-page action.
- Friends: input reveal, sorting and activity tabs; original renderer checked with a temporary browser-only populated fixture, then restored. No friend request was sent.
- Profile: data load, About/Posts, follower list, Edit Profile.
- Settings: categories, appearance controls, keyboard navigation, unsaved-field retention, opening/canceling the existing delete confirmation. No account/profile/password/deletion change was submitted.
- Support controls retained; no ticket was submitted.
- Privacy: all eleven sections and contents navigation; supplied image asset decoded successfully.
- Both themes checked across all listed pages at 1024px and 800px with no page overflow or clipped controls. Desktop layouts visually reviewed at 1440px. Existing phone gate retained.
- Protected landing/shared styles/editor hashes and editor HTML region compared with the production baseline; node syntax and diff checks passed.
