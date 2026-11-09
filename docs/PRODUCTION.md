# Production release and repository parity

The prior source release, **v3.6.23**, was reconciled with the running iwrite4.me container on 2026-11-08. This source adds the v3.6.24.0 guest writing session; deploy only after the release's integration tests pass.

## Build from Git

```sh
npm ci
node --test tests/*.test.js test/*.test.js
docker build -t localhost:5000/iwrite:<git-commit> .
```

The Dockerfile matches production's Node 20 Bookworm runtime and starts `npm start`. Application JavaScript and public assets are served directly; there is no frontend build step. `RELEASE.json` records the deployed v3.6.23 overlay provenance and file hashes; it is historical release metadata, not the source selector for future builds.

## Deployment configuration

Production is a Docker-image application in Coolify on the VPS. Pushing to GitHub alone does not deploy it. Build the image from the intended committed revision, push it to the VPS registry, then select that image tag in Coolify and deploy. Record the Git revision, image tag/digest, test result, and rollback image for each release. Commit and push source changes before deployment so image overlays cannot become the only copy of a live fix.

The reconciled production image is `localhost:5000/iwrite:20261108-uzs-offer`, digest `sha256:78b805b9a8e15e7c3dad8d84af0392f6bd0d890a4917cdd7d91aa122a4f9f4d2`. Its preceding rollback image is `localhost:5000/iwrite:20261107-monthly299`.

Keep the existing PostgreSQL configuration and persistent `/app/server/data` mount when replacing the app container. Database records, uploaded media, environment files, SSH keys, and API secrets belong in the existing runtime storage/Coolify settings, outside Git and Docker build contexts.

## Billing configuration

The monthly Stripe product default and `STRIPE_PRICE_1M` both use `price_1UZFdGBuf5ulEh9pbaV5d2J6` for **USD 2.99 per month**. The old USD 1.99 price is archived. Changing only the Stripe product default does not change checkout: `server/routes/stripe.js` uses the environment variable explicitly. Preserve that setting on a rebuild. Stripe secret/webhook keys remain in Coolify.

The 3-month and 6-month prices remain USD 4.99 and USD 8.99. Local-payment amounts are controlled separately by `PRICE_UZS_1M`, `PRICE_UZS_3M`, and `PRICE_UZS_6M`. The monthly UZS presentation is a crossed-out 35,990 followed by bold ~25,000 UZS; the approximation does not override the configured local checkout amount.

## Validation

Unit/browser-logic tests run with the command above. Database integration tests are opt-in with `RUN_STAGING_DB_TESTS=1` and `STAGING_MODE=1`; they assert that the database is `iwrite_staging`. Use only the isolated staging database and test-only service credentials. The database suite must never point at production.

After deployment, verify `/api/version`, `/api/health`, the landing and dashboard pricing, and the new container's checkout Price ID. Confirm the guest editor, draft preservation and account saving against staging first; avoid consuming a visitor's live weekly allowance for routine monitoring. The reconciliation also compares application file hashes with the running production snapshot.
