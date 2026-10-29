# Sidebar redesign — staging

## Intent
A returning writer needs a quick path to the page, a clear view of their workspace, and access to their writing community. The sidebar should feel like a calm writing tool and remain usable as an icon rail.

Domain: drafts, sessions, writing practice, readers, community, personal progress. Color world: green ink, pale paper, muted graphite, warm streak amber, dark desk surfaces. The existing dashboard's light/dark palette remains the source of truth.

Signature: the writing action leads, Workspace and Connect separate private practice from the community, and the real writing streak sits beside the account area. Avoid the incumbent undifferentiated list, decorative sidebar illustrations and invented activity/progress data.

## Component decisions
- Brand: compact wordmark and a secondary writing-space line; the existing logo/collapse action is preserved.
- Compose: a 44px primary New session action calls the existing picker. It becomes a plus button in the rail.
- Navigation: Workspace and Connect groups, quieter utility rows, a selected background/dot and a consistent 22px SVG box. All existing destinations remain, including the conditional hidden duel entry.
- Subscription: existing Upgrade/Manage Subscription action in a distinct two-line row. Its dynamic label and plan handler stay intact.
- Account: existing avatar/name/plan/level fields, a real streak button, theme toggle and logout. The profile card gains keyboard activation without nesting the existing plan buttons inside another button.
- Motion: preserve the synchronized 240ms width/content transition; labels fade without changing icon alignment. Native titles and accessible labels remain on icon-only actions. Reduced motion disables transitions.
- Typography: Archivo wordmark, Instrument Sans interface text, tabular numeric badges. The app's three-font system remains intact.
- Density: 4px base, 38px navigation rows, 44px compose action, 12px horizontal sidebar inset. The expanded panel is 264px; rail remains 68px. Navigation scrolls independently at short heights while account actions remain anchored.

## Preservation and verification
All original sidebar IDs and data-view destinations were compared before/after and retained. Existing navigation, quota/picker, theme, subscription, badge and logout handlers are reused. The landing, shared production styles and editor HTML/source remain unchanged.

Browser checks in light and dark modes passed for Dashboard, Sessions, Community, Leaderboard, Friends, Profile, Settings, Support, Privacy and subscription navigation; selected accessibility state; new-session shortcut/focus return; streak popup; keyboard account access; rail expand/collapse; original badges and conditional duel entry. No writing session was created by QA.

Final laptop-height verification: 22 animation frames sampled with 0px icon travel; sidebar/content movement stayed synchronized through collapse and rapid reversals. At 1280x720 there was no horizontal page overflow, footer actions remained visible, and the privacy link was reachable by scrolling the navigation region. Preview-account logout cleared its local token and returned to the login form. Both theme screenshots were reviewed at 1440x1000.
