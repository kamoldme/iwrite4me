<div align="center">

# iWrite4.me

### Brainstorm without distractions. Write or lose it.

A focus-first writing app that turns daily writing into a habit you actually keep — timed sessions, a streak you don't want to break, and a community that keeps you honest.

[**Live app → iwrite4.me**](https://iwrite4.me)

</div>

---

## What it is

iWrite4.me is a distraction-free writing environment built around short, timed sessions. You pick a duration and a mode, the editor goes full-screen, and you write until the timer runs out. Finish a session and you earn XP, grow your writing streak, and watch a tree grow from seed to forest as you keep showing up.

It's part writing tool, part habit tracker, part community. The goal is simple: get words out of your head and onto the page, every day.

## Features

### ✍️ Writing
- **Timed focus sessions** — choose a duration, go full-screen, and write. A live timer and word counter keep you moving.
- **Three modes:**
  - **Normal** — a standard timed session with autosave and formatting.
  - **Zen** — pure flow. No XP, no pressure, just writing.
  - **Dangerous** — write or lose it. Stop typing for too long and your words start disappearing. The ultimate cure for the blinking cursor.
- **Autosave & session recovery** — refresh or lose connection mid-session and pick up exactly where you left off.
- **Reflection prompts** — a rotating set of prompts to break through a blank page.
- **Ambient sound** — lo-fi, brown noise, rain, wind, and focus tones to settle into the work.
- **Research assistant** — a side drawer to look things up without leaving the page.

### 🌱 Motivation & gamification
- **XP & levels** — every completed session earns experience based on words written and time spent.
- **Streaks** — write daily to keep your streak alive; miss a day and it resets.
- **Writing tree** — a living visualization that grows from a seed to a full tree as your streak climbs.
- **Achievements** — milestones for word counts, streaks, sessions, and more.
- **Activity heatmap** — a year-at-a-glance view of when you write.
- **Daily word goal** — set a target and track today's progress with a ring.

### 👥 Community
- **Stories feed** — publish a finished session as a story and read what others are writing.
- **Likes, comments & follows** — engage with other writers.
- **Public profiles** — share your writing tree, stats, and published stories.

### ⚔️ Compete
- **Writing duels** — head-to-head challenges where the most words (or the last writer standing) wins.
- **Leaderboards** — ranked by streaks, time written, and referrals.
- **Friends** — add friends and challenge them directly.

### 🎨 Personalization
- **Themes** — Dark, Light (a warm parchment "Writer's Desk"), and Sepia, all sharing one polished dashboard layout.
- **Editor fonts** and adjustable page zoom.
- **Avatars & profile banners.**

### ⭐ Pro
- Higher word and edit limits, more early session completes per month, in-depth **session analytics**, copy-during-session, and custom session durations. Billed through Stripe.

## Tech stack

| Layer | Tech |
|-------|------|
| Backend | Node.js, Express |
| Database | PostgreSQL (`pg`) |
| Auth | JWT (`jsonwebtoken`), `bcryptjs`, Google OAuth (`google-auth-library`) |
| Payments | Stripe (subscriptions + webhooks) |
| Media | `multer` (uploads), `sharp` (avatar/banner processing) |
| Security | `helmet` (CSP, HSTS), `express-rate-limit`, CORS, `validator` |
| Notifications | Telegram bot (`node-telegram-bot-api`) for admin alerts |
| Research assistant | Google Gemini API |
| Frontend | Vanilla HTML / CSS / JavaScript — no framework, no build step |
| Hosting | Railway (Nixpacks build, managed Postgres) |

The frontend is a deliberately dependency-free single-page app: a handful of ES modules (`app.js`, `api.js`, `editor.js`, `tree.js`, `stories.js`, …) and one stylesheet. No bundler, no transpiler — what you see in `public/` is what ships.

## Project structure

```
iwrite/
├── server/
│   ├── index.js            # Express app: middleware, CSP, CORS, route mounting
│   ├── routes/             # API endpoints, one file per domain
│   │   ├── auth.js         #   email/password + Google OAuth, JWT, /me
│   │   ├── documents.js    #   writing sessions, completion, heatmap, analytics
│   │   ├── stories.js      #   community feed, publishing, comments
│   │   ├── duels.js        #   writing duels + matchmaking
│   │   ├── friends.js      #   friend requests & lists
│   │   ├── stripe.js       #   checkout sessions + webhooks
│   │   ├── profiles.js, follow.js, prompts.js, research.js,
│   │   ├── announcements.js, support.js, share.js, admin.js
│   ├── middleware/         # auth (JWT), subscription-expiry checks
│   ├── utils/              # storage layer (Postgres) + helpers
│   ├── data/               # seed data
│   ├── seed.js             # seed the database
│   ├── migrate-to-pg.js    # migration helper
│   └── telegram.js         # admin notification bot
├── public/
│   ├── index.html          # marketing landing page
│   ├── app.html            # the writing app (SPA)
│   ├── story.html          # public story reader
│   ├── admin.html          # admin dashboard
│   ├── privacy.html, terms.html
│   ├── css/style.css       # all styles (themes, editor, dashboard)
│   └── js/                 # app.js, api.js, editor.js, tree.js, stories.js, …
├── railroad.json           # Railway deploy config
├── nixpacks.toml           # build config
├── CHANGELOG.md
└── VERSION
```

## Getting started

### Prerequisites
- Node.js 18+
- A PostgreSQL database

### Setup

```bash
# 1. Clone
git clone https://github.com/kamoldme/iwrite.git
cd iwrite

# 2. Install dependencies
npm install

# 3. Create a .env file (see Environment variables below)
#    At minimum: DATABASE_URL and JWT_SECRET

# 4. Initialize / seed the database
node server/seed.js

# 5. Run
npm run dev        # auto-restarts on file changes (node --watch)
# or
npm start          # production start
```

The app serves on `http://localhost:3000` by default. The marketing site is at `/`; the app is at `/app`.

## Environment variables

Create a `.env` file in the project root.

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret used to sign auth tokens |
| `PORT` | — | Server port (defaults to `3000`) |
| `NODE_ENV` | — | `production` enables strict CORS/HSTS |
| `APP_URL` | — | Public base URL, used in generated links |
| `GOOGLE_CLIENT_ID` | — | Enables "Sign in with Google" |
| `STRIPE_SECRET_KEY` | — | Enables Pro subscriptions |
| `STRIPE_WEBHOOK_SECRET` | — | Verifies incoming Stripe webhooks |
| `STRIPE_PRICE_*` | — | Stripe price IDs for the plans |
| `GEMINI_API_KEY` | — | Enables the in-app research assistant |
| `TELEGRAM_BOT_TOKEN` | — | Admin notification bot |
| `TELEGRAM_ADMIN_CHAT_ID` | — | Where admin alerts are sent |
| `TELEGRAM_ACCESS_CODE` | — | Gate for admin bot commands |
| `ADMIN_PASSWORD` | — | Admin dashboard access |

Optional integrations degrade gracefully — leave Stripe, Google, Gemini, or Telegram unset and the rest of the app still runs.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm start` | Start the server (`node server/index.js`) |
| `npm run dev` | Start with auto-restart on changes (`node --watch`) |
| `node server/seed.js` | Seed the database |
| `node server/migrate-to-pg.js` | Run the Postgres migration helper |

## Deployment

The app is built for [Railway](https://railway.app):

1. Create a Railway project and add a **PostgreSQL** plugin.
2. Connect this repo (or deploy via the Railway CLI with `railway up`).
3. Set the environment variables above in the Railway dashboard (`DATABASE_URL` is provided automatically by the Postgres plugin).
4. `railroad.json` + `nixpacks.toml` handle the build; the start command is `npm start`.
5. Point your custom domain at the service.

Because the server is a single Express process serving both the API and the static frontend, it runs anywhere Node + Postgres are available — Railway is just the path of least resistance.

## Security

- Passwords hashed with bcrypt; sessions via short-lived JWTs.
- `helmet` sets a strict Content-Security-Policy and HSTS.
- Rate limiting on auth and API routes.
- CORS locked to known origins in production.
- Input validation and email normalization on registration.

## License

© iWrite4.me. All rights reserved.
