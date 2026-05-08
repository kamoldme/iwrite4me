# Changelog

## [3.0.41] - 2026-05-08

### Security
- Login rate-limiting tightened from 20 attempts / 15 min to **5 / 15 min** (with skipSuccessfulRequests so legitimate users aren't punished)
- Registration rate-limiting added: **5 accounts / hour** per IP
- Email format validation on registration via `validator.isEmail()`; emails normalized (lowercase + trim) so case variants can no longer create duplicate accounts
- Password minimum bumped from 6 → 8 characters; added a small common-password deny-list (`password`, `12345678`, `iwrite4me`, etc.)
- `helmet` middleware enabled with a CSP that allows the third-party services the app actually uses (Google Tag Manager, Google OAuth, Stripe, Google Fonts); also enables HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- `x-powered-by: Express` header removed
- JWT lifetime reduced from 7 days → 2 days
- One-shot cleanup script added (`server/scripts/cleanup-pentest-accounts.js`) to remove test accounts created during the security audit; run with `railway run node server/scripts/cleanup-pentest-accounts.js`

## [2.3.9] - 2026-03-23

### Changed
- Stories feed redesigned with featured hero card (top story from last 7 days by popularity) and content-first card layout
- Story reader now uses editorial serif typography (Georgia, 20px, 1.7 line-height, 680px max-width) for a Medium-like reading experience
- Story composer toolbar replaced with floating selection toolbar that appears on text selection — includes Bold, Italic, Link (inline URL input), and a Format dropdown (Normal/H1/H2/H3/Blockquote/Lists)
- PRO badge in story author row extracted from inline styles to `.pro-nav-badge` CSS class (DRY fix)
- Responsive breakpoints added for mobile (<768px, 44px touch targets) and tablet (768-1024px, 640px max-width)

### Added
- Skeleton loading cards replace spinner while Stories feed loads (3 pulsing placeholder cards)
- Bottom action bar in story reader (like/comment/share) duplicated below content, synced with top bar
- Bottom action bar added to public story page (`/story/:id`)
- Format dropdown in composer: Normal text, Heading 1-3, Blockquote, Bulleted list, Numbered list

### Removed
- Font selector removed from story composer
- All color picker buttons removed from story composer
- Side metrics panel removed from feed cards (metrics now inline in card footer)
