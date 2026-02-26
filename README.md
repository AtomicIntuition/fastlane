# FastLane

FastLane is a production-ready intermittent fasting app built with Next.js 16, Drizzle ORM, and Postgres.

## Features

- Personalized fasting setup and onboarding
- Live fasting session start/end tracking
- Check-in history (energy, hunger, mood)
- Stripe checkout + billing portal
- Webhook processing with idempotency + replay audit
- Admin webhook reprocess endpoint
- Account-link API foundation (`/api/fastlane/auth/link`)
- Token-based auth session APIs (`/api/fastlane/auth/session/*`)
- Analytics ingestion API + admin KPI dashboard
- Monitoring readiness in `/api/health` + Sentry alert runbook
- Mobile-optimized UI and FastLane e2e coverage

## Tech Stack

- Next.js (App Router)
- TypeScript
- Drizzle ORM + Postgres
- Vitest + Playwright
- Sentry

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Configure env vars in `.env.local` (minimum):

```bash
DATABASE_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_MONTHLY=
STRIPE_PRICE_YEARLY=
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
CRON_SECRET=
USER_COOKIE_SECRET=
FASTLANE_ACCOUNT_SESSION_SECRET=
FASTLANE_LOGIN_TOKEN_SECRET=
RESEND_API_KEY=
FASTLANE_AUTH_EMAIL_FROM=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For production, start from `.env.production.example` and set real values in your host secrets.

3. Run the app:

```bash
npm run dev
```

## Database

Generate migrations:

```bash
npm run db:generate
```

Push schema:

```bash
npm run db:push
```

## Testing

Unit tests:

```bash
npm run test:fastlane
```

End-to-end (desktop):

```bash
npm run test:e2e:fastlane
```

End-to-end (mobile):

```bash
npm run test:e2e:fastlane:mobile
```

Accessibility e2e (desktop + mobile):

```bash
npm run test:e2e:fastlane:a11y
```

Lighthouse (landing + app demo):

```bash
npm run test:lighthouse
```

Lighthouse strict mode (fails if lhci is missing; used in CI):

```bash
npm run test:lighthouse:strict
```

Release gate (full launch checks):

```bash
npm run test:release-gate
```

Staged gate commands (recommended workflow):

```bash
# Fast inner loop (lint + types + focused unit coverage)
npm run test:gate:fast

# Milestone gate (lint + types + desktop e2e + a11y)
npm run test:gate:milestone

# Ship gate (strict launch checks + full regression + strict lighthouse)
npm run test:gate:ship
```

Cron config guard:

```bash
npm run check:vercel-cron
```

Environment preflight:

```bash
npm run check:env
```

Strict production env preflight:

```bash
npm run check:env:strict
```

Local strict preflight using the production template:

```bash
set -a
source .env.production.example
set +a
npm run check:env:strict
```

## Monitoring

- `/api/health` returns `status: "ok"` in non-production.
- In production, `/api/health` returns `status: "degraded"` with HTTP `503` when required config is missing.
- Readiness details are included under `readiness` in the response payload.
- Admin readiness endpoint: `/api/admin/fastlane/readiness` (auth required) includes readiness + failed webhook backlog.
- Configure Sentry and alert destinations in production.
- Runbook: [MONITORING_ALERTS.md](./MONITORING_ALERTS.md)
- Operations runbook: [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md)

## Project Scope

This repository is FastLane-only. All legacy routes/components/scripts have been removed.
