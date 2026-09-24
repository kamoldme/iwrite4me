# Session feedback

Show a centered card within the existing completion screen, after the server saves a nonempty session. Ask “How enjoyable was your writing session?” with five labelled stars, then an optional comment (1,000 characters). Keep navigation available; no extra blocking dialog, automatic focus grab, or reward for positive reviews.

Claim the invitation on the server: one invitation per account every seven days, including dismissal or leaving the screen. Successful submission pauses invitations for 30 days across devices. No visible ticking countdown; a quiet thank-you states the 30-day pause. Exclude failed, empty, deleted, historical and already-rated sessions. Rating is required to submit; comment is optional. Do not submit a rating merely by clicking a star.

Persist feedback before notifying Telegram. Store rating, comment, user ID, document ID, mode, words, duration and timestamp; never include writing content. Use an account-level database lock to prevent duplicate invitations/submissions across tabs and processes. Repeated submissions return the existing response without another notification. Keep feedback separate from support tickets. Admin Feedback includes total responses, average, positive share (4–5 stars), distribution and paginated recent comments.

Verify validation, ownership, completion eligibility, cooldown boundaries, concurrent requests, retries, admin authorization, escaped user input, browser submission and error recovery. Deploy only the feature patch on top of the running VPS image: production currently contains changes not present on the GitHub production-fix branch. Preserve the running container configuration and previous image for rollback.

## Completion animation

Keep navigation visible in a stable bottom row. Show the completion title for four seconds, fade in the statistics with a stagger, allow 3.4 seconds to read them, then fade the summary out and reveal eligible feedback. Claim the invitation only after the statistics phase. Keep statistics visible on cooldown or API failure. Leaving cancels all later transitions; skipping feedback restores statistics. Reduced-motion preferences remove both animations and forced waits.
