# FastLane Operations Runbook

## Purpose

This runbook defines production maintenance operations for FastLane auth/session hygiene and webhook recovery.

## Scheduled Maintenance (Cron)

- Platform: Vercel Cron
- Config file: `vercel.json`
- Job:
  - Path: `/api/fastlane/maintenance/run`
  - Schedule: `15 3 * * *` (daily at 03:15 UTC)
- Auth:
  - `Authorization: Bearer <CRON_SECRET>`
  - `CRON_SECRET` must be set in production environment variables.

## Unified Maintenance Endpoint

- Route: `POST /api/fastlane/maintenance/run`
- Required headers:
  - `content-type: application/json`
  - `authorization: Bearer <CRON_SECRET>`
- Optional body:
  - `dryRun` (`boolean`)
  - `replayLimit` (`1..10000`)
  - `throttleLimit` (`1..10000`)
  - `throttleRetentionDays` (`1..365`)

Example dry run:

```bash
curl -sS -X POST "$APP_URL/api/fastlane/maintenance/run" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $CRON_SECRET" \
  -d '{"dryRun":true,"replayLimit":1000,"throttleLimit":1000,"throttleRetentionDays":30}'
```

Example execution:

```bash
curl -sS -X POST "$APP_URL/api/fastlane/maintenance/run" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $CRON_SECRET" \
  -d '{"dryRun":false,"replayLimit":1000,"throttleLimit":1000,"throttleRetentionDays":30}'
```

## Admin Readiness Console Operations

- UI: `/admin/fastlane/readiness`
- Auth: admin token (`CRON_SECRET`) + admin session cookie
- Mutation security: admin CSRF token is required for maintenance actions.
- Unified actions in UI:
  - `Run all maintenance dry-run`
  - `Run all maintenance now`
- Telemetry semantics:
  - Maintenance success/failure counters represent admin maintenance endpoint outcomes.
  - Success = maintenance route completed and returned success response.
  - Failure = server-side exception path in maintenance route execution.
  - Last success/failure timestamps track most recent recorded telemetry events.

## Overview Route Failure Interpretation

The admin overview snapshot surfaces:
- `Route Failures (R/T/U)`:
  - `R` = replay cleanup failure count
  - `T` = throttle cleanup failure count
  - `U` = unified run failure count
- `Worst Failure Route`:
  - route name with the highest observed failure count in telemetry.

Use this as first triage signal:
1. `REPLAY` worst:
   - Validate replay marker table size/expiry patterns.
   - Run `Replay cleanup dry-run`, then `Purge expired replay markers`.
2. `THROTTLE` worst:
   - Validate throttle row growth and retention-days input.
   - Run `Throttle cleanup dry-run`, then `Purge stale throttle rows`.
3. `RUN` worst:
   - Run individual replay/throttle maintenance routes separately to isolate failing branch.
   - Compare per-route success/failure counters after each run.
4. `NONE` with non-zero global failures:
   - Verify telemetry freshness and refresh snapshot/readiness once.
   - Inspect server logs around maintenance endpoints for recent exceptions.

## Incident Triage

1. Open `/api/health` and verify readiness status.
2. Open `/api/admin/fastlane/readiness` and inspect:
   - failed webhook backlog
   - replay marker counts
   - auth throttle stale rows
3. Run unified maintenance dry-run.
4. Run unified maintenance execution.
5. If webhook backlog remains, use admin webhook reprocess endpoint:
   - `POST /api/admin/fastlane/webhook/reprocess`
6. Re-check readiness and KPI snapshots.

## Required Environment Variables

- `CRON_SECRET`
- `USER_COOKIE_SECRET`
- `FASTLANE_ACCOUNT_SESSION_SECRET`
- `FASTLANE_LOGIN_TOKEN_SECRET`
- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_MONTHLY`
- `STRIPE_PRICE_YEARLY`
- `NEXT_PUBLIC_APP_URL`

## Verification Checklist

- `npm run check:vercel-cron`
- `npm run check:env` (standard)
- `npm run check:env:strict` (production pre-deploy)
- `npm run test:fastlane`
- `npm run test:e2e:fastlane:all`
- `npm run test:e2e:fastlane:a11y`
- `npm run test:lighthouse:strict` (CI/strict environment)
