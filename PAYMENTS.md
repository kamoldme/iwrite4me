# Local payments (Uzbekistan) — setup & status

iWrite accepts **one-time passes** in UZS via local providers, in addition to Stripe
(international cards). A successful local payment grants `plan:'premium'` for the pass
window (1m/3m/6m → 30/90/180 days) using the same `planExpiresAt` model + auto-downgrade
sweep as Stripe. Buying again before expiry **stacks** the time.

Everything is **env-gated**: each provider's routes return `503 not configured` until its
keys are set in Railway, so nothing can charge anyone before your merchant accounts are live.

## Status

| Provider | Type | Backend | Status |
|----------|------|---------|--------|
| Click | wallet redirect | `server/routes/click.js` | ✅ built, sandbox-ready |
| Payme | wallet (JSON-RPC) | `server/routes/payme.js` | ✅ built, sandbox-ready |
| Atmos | card via **hosted** checkout (UZCARD/HUMO/Visa/MC) | `server/routes/atmos.js` | ✅ built, sandbox-ready |
| Pricing UI (UZS buttons + secure-pay logos) | — | `public/js/app.js` | ✅ built |

Atmos uses its **hosted card page** (the card number is entered on Atmos, never on iWrite —
PCI SAQ A). Once Payme/Click go live, drop their official logo SVGs into
`public/img/payme.svg` and `public/img/click.svg` and they replace the text chips automatically.

## What YOU need to register (the long pole — start now)

Each provider requires a **merchant account** tied to an Uzbek legal entity + bank account.
This is the slow part (days–weeks); the code is ready to receive the credentials.

1. **Click** — register a merchant + service at [click.uz](https://click.uz) (Merchant / SHOP API).
   Collect: `service_id`, `merchant_id`, `secret_key`.
2. **Payme** — merchant cabinet at [payme.uz](https://payme.uz) (Merchant / Business). Collect: cashbox `merchant_id` + `key`.
3. **Atmos** — [atmos.uz/for-developers](https://atmos.uz/en/for-developers). Collect: `consumer_key`, `consumer_secret`, `store_id`.

## Env vars to set in Railway (when you have them)

```
# Local prices in som (integers). 0/unset = that duration is hidden.
PRICE_UZS_1M=...
PRICE_UZS_3M=...
PRICE_UZS_6M=...

# Click (live now once these are set)
CLICK_SERVICE_ID=...
CLICK_MERCHANT_ID=...
CLICK_SECRET_KEY=...

# Payme (when built)
PAYME_MERCHANT_ID=...
PAYME_KEY=...

# Atmos (when built)
ATMOS_CONSUMER_KEY=...
ATMOS_CONSUMER_SECRET=...
ATMOS_STORE_ID=...
```

Rough pricing guide: ~12,000–13,000 UZS per USD — set the exact som amounts you want
(they don't have to mirror the USD prices).

## Callback URLs to configure in each provider's cabinet

- **Click** — Prepare URL: `https://iwrite4.me/api/click/prepare` · Complete URL: `https://iwrite4.me/api/click/complete`
- **Payme** — endpoint: `https://iwrite4.me/api/payme`
- **Atmos** — success callback: `https://iwrite4.me/api/atmos/callback` (confirm field names + signature at onboarding)

## Before go-live

- Click and Payme both validate your endpoints in a **sandbox** before activating the
  merchant (Payme runs a strict compliance script against the JSON-RPC state machine).
  Confirm exact field names / amount formats against each provider's current docs during
  that step — the implementations follow the standard specs but sandbox is the source of truth.
- Test a full cycle on each: create → pay (test card) → verify premium granted → verify
  expiry/auto-downgrade.
