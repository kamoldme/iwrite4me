# Session feedback

Show a centered card within the existing completion screen, after the server saves a nonempty session. Ask “How enjoyable was your writing session?” with five labelled stars, then an optional comment (1,000 characters). Keep navigation available; no extra blocking dialog, automatic focus grab, or reward for positive reviews.

Claim the invitation on the server: one invitation per account every seven days, including dismissal or leaving the screen. Successful submission pauses invitations for 30 days across devices. No visible ticking countdown; a quiet thank-you states the 30-day pause. Exclude failed, empty, deleted, historical and already-rated sessions. Rating is required to submit; comment is optional. Do not submit a rating merely by clicking a star.

Persist feedback before notifying Telegram. Store rating, comment, user ID, document ID, mode, words, duration and timestamp; never include writing content. Use an account-level database lock to prevent duplicate invitations/submissions across tabs and processes. Repeated submissions return the existing response without another notification. Keep feedback separate from support tickets. Admin Feedback includes total responses, average, positive share (4–5 stars), distribution and paginated recent comments.

Verify validation, ownership, completion eligibility, cooldown boundaries, concurrent requests, retries, admin authorization, escaped user input, browser submission and error recovery. Deploy only the feature patch on top of the running VPS image: production currently contains changes not present on the GitHub production-fix branch. Preserve the running container configuration and previous image for rollback.

## Completion animation

Reveal the title then statistics within two seconds (500ms title lead, 500ms staggered stat animations). Show Next after two seconds and hold the summary until it is clicked. Only then claim and show feedback, with stars and the optional comment visible together. Final buttons are START AGAIN and GO TO DASHBOARD: either saves selected feedback before navigating, or skips if blank. On cooldown or API failure, Next reveals those navigation buttons without prompting. Failed sends retain the draft and offer retry or an explicit continue-without-sending action. Reduced motion skips animation and forced waits. Leaving cancels pending transitions.
