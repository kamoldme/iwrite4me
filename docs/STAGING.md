# Staging Workflow

This branch uses GitHub's `staging` environment name through `.github/workflows/staging.yml`.

## Current State

- Local staging branch: `staging/soft-writing-space`
- GitHub auth on this machine is currently invalid, so the branch and workflow cannot be pushed yet.
- The workflow runs checks only. It does not deploy to production.

## To Enable On GitHub

1. Re-authenticate GitHub locally:

   ```bash
   gh auth login -h github.com
   ```

2. Push the branch:

   ```bash
   git push -u origin staging/soft-writing-space
   ```

3. In GitHub, go to `Settings -> Environments` and create `staging` if GitHub has not auto-created it from the workflow.

4. Use `staging/**` branches for landing experiments while production is in maintenance.

## Optional Railway Staging

If we want this GitHub environment to deploy a separate Railway staging app, create a separate Railway service/environment first, then add those deployment credentials to the GitHub `staging` environment secrets. Keep production secrets out of staging.
