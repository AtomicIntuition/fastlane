# Test Strategy - FastLane

## Unit Tests
- Fasting duration calculations
- Eating window math
- Streak continuity rules
- History summarization logic

## Integration Tests
- Onboarding state transitions
- Timer start/stop and history write
- Paywall trigger and gating behavior
- API route behavior (`/api/fastlane/state`, `/session/start`, `/session/end`, `/checkin`, billing webhook)

## E2E Tests
- Landing CTA to app route
- New user onboarding to first fast start
- First completed session updates dashboard
- Mobile viewport parity for core FastLane funnel (Mobile Chrome project)

## Quality Gates
- `npm run lint`
- `npm run type-check`
- `npm test`
- Playwright e2e for conversion-critical flows
- `npm run test:lighthouse` (local-friendly), `npm run test:lighthouse:strict` (CI enforcement)
- CI workflow: `.github/workflows/fastlane-ci.yml`
