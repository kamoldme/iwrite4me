# Staging dashboard design

Scope: dashboard only, on the isolated production-copy staging deployment. Landing, editor, writing timers, subscription logic and production deployment are outside this change.

## Intent and visual direction

A writer arrives to start a session or return to a saved document, then checks progress. Start Writing remains the primary action. Recent documents are directly below activity; habit and achievement widgets follow.

The supplied dark widget reference pins the visual direction: near-black canvas, a mint activity curve, amber goal dial and iris session rhythm. These are real saved-session values rather than simulated smart-home values or continuous decorative animation. The preview account is visibly labeled as sample data.

- Palette: canvas #050809, surface #0b100f, primary #f7faf9, secondary #a3aeaa, mint #8cffd4, amber #fb9b52, iris #a78bfa.
- Type: existing Instrument Sans, 13–14px controls/content, 20px section titles, 27px overview values, 36px maximum page heading. Numeric values use tabular figures.
- Spacing: 4px base; 12px within control groups, 24px between sections, 28–32px widget padding. Rounded widgets preserve the reference; document rows use smaller 18px corners.
- Structure: compact header, overview strip, activity, recent documents, goal/rhythm, reflection, calendar/tree. The sidebar retains existing navigation.
- Motion: 150ms control feedback; 240ms arc rotation and achievement paging. No autonomous bobbing, fake data or chart scrolling. Reduced motion disables transitions.

## Skills used by stage

UI Skills Root routes the task. Interface Design and Frontend Design inform composition and tokens. Improve UI and Improve provide read-only product audits; Improve Animations and 12 Principles provide a read-only motion audit. Better UI informs interaction details; UI/UX Pro Max provides chart/accessibility guidance; Impeccable supplies the final craft checks.

The supplied screenshot already chooses a direction, so Design Lab's five-variant interview is not forced into this implementation. Improve React does not apply to this plain JavaScript product. Installing a skill does not make every workflow appropriate to run.

## Audit findings resolved

1. Daily totals diverged between header, goal counter and percentage. One local-calendar-day calculation now updates all three, using the same document exclusions as the activity chart.
2. Activity had no visible date anchors or precise readout. It now has date labels, pointer inspection and an expandable native HTML data table for keyboard/screen-reader access.
3. Session rhythm bars exposed only mouse titles. Native buttons now reveal date and word count through pointer, focus or activation.
4. The goal knob interpolated along a chord. It now rotates around the dial center.
5. Inherited SVG dimensions clipped achievement rings; inherited panel height/gaps stretched the goal card on narrower desktops. Scoped overrides correct both.

## Data and limits

Activity totals group each currently saved document's word count under its updated/created date, matching the available document-based dashboard data. They are not a keystroke-level writing history. Changing the goal continues to use the existing local-device goal setting.

Recent document titles use textContent. Their buttons call the existing App.openDocument action; All documents uses the existing view switch. No document save/edit behavior is replaced.

The existing phone gate remains. This desktop writing product has not gained a mobile editor as a side effect of the redesign.
