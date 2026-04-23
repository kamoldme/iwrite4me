# Instructions for Vibe-Coding on iWrite Tool

Read this before doing anything. These rules are non-negotiable unless the user says otherwise.

## Project basics
- **Project**: iWrite Tool
- **Stack**: Node.js + Express backend, vanilla JS SPA frontend, PostgreSQL (Railway), Stripe, Telegram bot
- **Main branch**: `main` (production)
- **Working branch**: `staging/new-features` (staging) — all new work goes here first

## Deploy rules
1. **Always deploy to staging first.** Never deploy to production unless the user explicitly says "deploy to production", "push to prod", or similar. A single past approval does NOT carry forward.
2. **Staging deploy command**:
   ```
   railway up --environment staging --detach
   ```
3. **Production deploy command** (only when explicitly asked):
   ```
   railway up --environment production --detach
   ```
4. **Push to GitHub when committing code.** After a commit, push to the current branch on origin (`git push origin staging/new-features`). Never force-push without explicit permission.
5. **Never commit unless the user asks.** Don't `git add` and `git commit` proactively. If in doubt, ask.

## Version bumping (required on every deploy)
Every deploy — staging OR production — must bump the version. No exceptions.

1. **VERSION file**: increment patch by 1 (`2.9.5` → `2.9.6`). Staging uses the `v2.x.x` scheme.
2. **Cache-bust JS/CSS query params** in `public/app.html` and `public/admin.html`:
   - If you edited `public/js/app.js`, bump `?v=N` on its script tag
   - Same for `editor.js`, `stories.js`, `api.js`, `tree.js`, `monsters.js`, `style.css`
   - Only bump the files you actually touched
3. The version badge on user panel and admin panel both pull from `/api/version`, which reads the `VERSION` file. Don't hardcode versions in HTML — the endpoint handles it.

## Workflow for any change
1. Read the relevant file(s) with Read/Grep before editing. Never blind-edit.
2. Make the edit with Edit tool (not Write, unless the file doesn't exist).
3. If the change is UI-observable, normally you'd verify in a browser — but since the DB is on Railway, just deploy to staging and let the user test.
4. Bump VERSION + cache-bust the changed JS/CSS file.
5. Deploy to staging with `railway up --environment staging --detach`.
6. Report back with a one-line summary and file:line references as markdown links.

## Code style
- **No em dashes.** Use commas, periods, or "..." instead.
- **No emojis** unless the user explicitly asks.
- **No comments** unless the WHY is non-obvious.
- **Don't explain WHAT the code does** — well-named variables do that.
- **Don't add error handling for impossible cases.** Trust framework guarantees.
- **Don't add features or refactor beyond what was asked.** Bug fix = bug fix, not cleanup.
- **Short responses.** Keep text between tool calls to ≤25 words. Final responses ≤100 words.

## Architecture quick-ref (file paths to edit)
- Main SPA logic: `public/js/app.js`
- Writing session/editor: `public/js/editor.js`
- Stories/Community tab: `public/js/stories.js`
- Styles: `public/css/style.css`
- Main HTML: `public/app.html` (user panel), `public/admin.html` (admin panel)
- Backend entry: `server/index.js`
- Routes: `server/routes/{auth,documents,stories,duels,friends,stripe,admin,support,research}.js`
- DB helper: `server/utils/storage.js` (PostgreSQL JSONB via `findOne`/`findMany`/`updateOne`)
- Telegram bot: `server/telegram.js`

## Env vars & secrets
- Each Railway environment (staging vs production) has its own env vars. Keys added to staging do NOT carry to production automatically.
- If the user adds a new env var on staging (e.g., `GEMINI_API_KEY`), remind them to add the same one on production before deploying there.
- **Never commit secrets** (.env, credentials.json). Warn the user if they ask you to.

## Browser tooling
- Use the `/browse` gstack skill for web browsing. **Never** use `mcp__claude-in-chrome__*` tools.

## Risky-action checklist
Confirm with the user before doing any of these:
- Destructive git ops (reset --hard, force push, branch deletion)
- Dropping DB tables / running migrations in production
- Deploying to production
- Creating/closing PRs or issues
- Sending messages via the Telegram bot
- Uploading to third-party services

## What NOT to do
- Don't skip version bump to save time.
- Don't deploy to production "because staging passed" without explicit ask.
- Don't introduce new abstractions for a one-line fix.
- Don't write multi-line comment blocks or docstrings.
- Don't create planning/decision markdown files unless asked.
- Don't use `--no-verify` on commits.
- Don't run long `sleep` commands or poll in loops.

## When stuck
- If local verification is impossible (DB dependent), say so and deploy to staging.
- If a tool call is denied, adjust — don't retry the same call.
- If uncertain about scope, ask ONE clarifying question, don't guess.
