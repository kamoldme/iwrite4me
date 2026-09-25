# Session feedback

Show a centered card within the existing completion screen, after the server saves a nonempty session. Ask “How enjoyable was your writing session?” with five labelled stars, then an optional comment (1,000 characters). Keep navigation available; no extra blocking dialog, automatic focus grab, or reward for positive reviews.

Claim the invitation on the server: one invitation per account every 30 days, including dismissal or leaving the screen. Successful submission restarts the 30-day pause across devices. No visible ticking countdown. Exclude failed, empty, deleted, historical and already-rated sessions. Rating is required to submit; comment is optional. Do not submit a rating merely by clicking a star.

Persist feedback before notifying Telegram. Store rating, comment, user ID, document ID, mode, words, duration and timestamp; never include writing content. Use an account-level database lock to prevent duplicate invitations/submissions across tabs and processes. Repeated submissions return the existing response without another notification. Keep feedback separate from support tickets. Admin Feedback includes total responses, average, positive share (4–5 stars), distribution and paginated recent comments.

Verify validation, ownership, completion eligibility, cooldown boundaries, concurrent requests, retries, admin authorization, escaped user input, browser submission and error recovery. Deploy only the feature patch on top of the running VPS image: production currently contains changes not present on the GitHub production-fix branch. Preserve the running container configuration and previous image for rollback.

## Completion animation

Reveal the title then statistics within two seconds (500ms title lead, 500ms staggered stat animations). Show Next after two seconds and hold the summary until it is clicked. Only then claim and show feedback, with stars and the optional comment visible together. The final button is SUBMIT, which saves chosen feedback and returns to the dashboard, or continues without feedback if blank. NEXT claims the account invitation; if it is still within 30 days of the previous prompt, NEXT takes the user to the dashboard without showing the rating form. Invitation errors keep the summary visible with Retry and Go to dashboard options. Failed sends retain the draft and offer retry or an explicit continue-without-sending action. Reduced motion skips animation and forced waits. Leaving cancels pending transitions.
