# Staging workspace design

Scope: app shell and non-editor views in public/app.html. Landing HTML/CSS/JS, editor markup, editor.js, and session-writing overlays are excluded. All new CSS is rooted under .app-container, a sibling of .editor-container.

## Intent and evidence
Writers arrive to start a session, return to a draft, or inspect progress. The supplied dashboard reference establishes a quiet sidebar, clear alignment, restrained cards, and a dominant activity panel. Keep those structural cues while prioritizing actual writing tasks.
Domain: drafts, daily practice, marginal notes, word goals, saved sessions, growth.
Color world: graphite pencil, ivory page, muted green bookmark, grey ink, quiet paper edges.
Signature: the writing goal and growing tree sit beside a real writing history, rather than finance metrics.
Avoid: duplicate primary actions in the same viewport, decorative emoji per card, animated card lifts, dark-only hardcoded tokens, fabricated activity data.

## Verified design issues and implementation plan
1. Dashboard experiment hardcodes background/text values in dashboard-experiment.css, while App._applyTheme changes html.light/sepia. Replace shell colors with semantic tokens scoped to .app-container, with light overrides. Verify both modes and leave editor inheritance untouched.
2. dashboard-experiment.css hides every dashboard .test-only element, including real daily-goal/reflection controls populated by _renderTestDashboard. Restore that pair in the right column, preserve IDs and existing handlers, remove the redundant decorative illustration, and make recent sessions span the available left column.
3. Stat cards, inputs, page headers and tabs have separate visual rules across the same workspace. Apply one control, radius, spacing, typography and border system to the app views only. Preserve routes, IDs, controls, and feature behavior.

Motion plan: remove card transform/blur effects in workspace; keep background/opacity feedback <=150ms, press scale .96 under no-preference only, explicit focus and disabled states, reduced-motion overrides confined to workspace. The editor and session picker are not changed.

## Design system
Base unit 4px. Sidebar 248px; main gutter 32px (20px compact). Content max 1320px.
Instrument Sans for controls/body/data. Fraunces for the dashboard greeting only, connecting the studio to writing.
Dark: graphite #171918, surface #202321, text #f0f1ed, secondary #b8bdb7, border #3b423c, accent #a8c5b0.
Light: page #f5f6f2, surface #fff, text #252e28, secondary #536157, border #d4dcd2, accent #315b43.
Depth: surface shifts and hairline borders; no card lifting or glow. Controls 8px radius; panels 14px.

## Verification
Browser fixtures exercise data, empty, populated, light/dark, navigation/search, reduced motion and compact view. Fixture values are never product defaults. Syntax checks plus protected-surface hashes guard excluded areas. No automated test script exists on this staging branch.

## Completed verification
- Both themes rendered with populated local fixture data at 1440px; compact empty state at 1024px had no horizontal overflow.
- Sessions, settings, community, leaderboard and plan screens inspected with local fixture data. No fixture data is shipped.
- Search opens the sessions view and focuses its input; active navigation exposes aria-current. The Cmd/Ctrl-K handler does not prevent the editor's keyboard event.
- 7/30-day chart selector updates the caption and dataset. Chart/calendar totals match after the calendar's local-day key correction.
- Compared computed color/background/type/spacing of the editor container and toolbar with the new stylesheet enabled/disabled: unchanged. Editor markup, editor.js, landing HTML/JS, and shared style.css remain byte-identical.
- Reduced-motion workspace overrides inspected in source. No authenticated backend, payment, or publishing transactions were exercised. Staging has no npm test script.
- Applied interface-design, frontend-design, better-ui. All twelve requested skill packages were fetched globally; the animation principles path was recovered from the author's archive. React auditing was not applied to this vanilla-JavaScript app.
