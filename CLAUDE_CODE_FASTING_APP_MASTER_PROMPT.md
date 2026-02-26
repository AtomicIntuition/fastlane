You are Claude Code acting as a principal product engineer, senior designer, and pragmatic founder-operator.

Your mission: build a production-ready intermittent fasting app MVP that feels premium, drives retention, and monetizes cleanly without dark patterns.

Project name (working): `FastLane` (rename if better brand is discovered during research).

You must execute this end-to-end with a strict, file-driven process so progress is never lost across context compaction.

## Skills/Tooling Bootstrap
- If your environment supports installable coding skills/agents/plugins:
  1. List currently available skills.
  2. Install and activate the minimal relevant set for:
     - product requirements/planning
     - UI/UX system design
     - Next.js app architecture
     - Stripe billing/paywalls
     - analytics instrumentation
     - testing/QA automation
     - security/performance hardening
  3. Record installed skills and why in `memory.md`.
- If no skill system exists, continue with native capabilities and document that choice.

## Critical Process Requirements (Do First)
1. Enter **Plan Mode first** before writing implementation code.
2. Create these files immediately:
   - `memory.md` (persistent context, decisions, assumptions, open questions, architecture notes)
   - `IMPLEMENTATION_PLAN.md` (detailed phase plan with task checkboxes, owners = Claude, status, and acceptance criteria)
   - `PRODUCT_REQUIREMENTS.md` (MVP scope, non-goals, personas, monetization rules, KPIs)
   - `BRAND_SYSTEM.md` (brand strategy, visual direction, voice/tone, naming rationale)
3. Keep these files continuously updated after each completed task.
4. If context compacts, resume by reading these files first and continue exactly where you left off.
5. No vague plan. Break work into concrete phases and tasks with validation gates.

## Product Goal
Create the best-in-class intermittent fasting app MVP for mobile web/PWA:
- Frictionless onboarding
- Elegant fasting timer and schedule management
- Strong habit loop (streaks, reminders, insights)
- Thoughtful paywall that converts without harming trust
- Beautiful, intentional UI (not template-like)
- Fast, reliable, and fully tested

## User/Business Outcomes
- Reduce bounce rate through a premium landing page and clear value proposition.
- Maximize activation: user starts first fast within 2 minutes.
- Build retention with daily utility and smart nudges.
- Monetize via subscription with free tier + paid tier differentiation.

## MVP Scope (Must Ship)
### 1) Landing + Marketing
- Conversion-first landing page with:
  - Hero with strong hook and immediate CTA
  - Social proof section (placeholder copy allowed but structured for future testimonials)
  - Feature/value sections tied to outcomes
  - Pricing teaser and paywall preview
  - FAQ addressing safety, science, and who it’s for
  - Mobile-first layout and fast loading
- SEO-ready metadata, OpenGraph, schema basics.
- Analytics events on primary CTAs and section engagement.

### 2) Auth + Onboarding
- Email/password and OAuth (at least one provider).
- Onboarding flow:
  - Goal capture (weight management, energy, metabolic health, routine)
  - Experience level (new/intermediate/advanced)
  - Preferred fasting window
  - Wake/sleep schedule + timezone
  - Notification preferences
- Generate initial personalized plan after onboarding.

### 3) Core Fasting Experience
- Live fasting timer with states:
  - fasting
  - eating window
  - paused/adjusted
- Preset protocols: 12:12, 14:10, 16:8, 18:6, 20:4, OMAD (+ custom).
- Start/stop/edit fasts.
- Calendar/history view.
- Streak tracking and consistency score.
- Daily check-in (energy, hunger, mood) with simple trend visualization.

### 4) Monetization + Paywall
- Tiered offering:
  - Free: basic timer + limited history
  - Pro: advanced insights, longer history, premium plans, deeper analytics, reminders automation
- Paywall moments:
  - End of onboarding (soft)
  - After meaningful activation milestone (stronger)
  - Feature-gated upsell points (contextual)
- Stripe subscription integration (monthly/yearly, trial logic configurable).
- Entitlement system in backend + middleware guard for premium features.
- Pricing experiment hooks (feature flags/remote config-ready structure).

### 5) Retention Systems
- Reminder engine (start/stop window reminders).
- Milestones and celebration moments (streaks, personal best).
- Re-engagement prompts for drop-off users.
- Lightweight weekly summary.

### 6) Quality + Production Readiness
- Unit + integration + e2e tests for core flows.
- Accessibility pass (keyboard, contrast, semantic landmarks, form labels).
- Performance targets:
  - Lighthouse mobile >= 90 for performance and accessibility on key routes
  - Fast first contentful paint on landing page
- Error monitoring and logging setup.
- CI pipeline for lint, typecheck, tests.
- Deployment-ready configuration for Vercel.

## Brand + Design Requirements (Non-Negotiable)
- Every pixel purposeful; no generic “weekend project” look.
- Mobile-first, then desktop enhancement.
- Strong visual identity:
  - Distinct color system with CSS variables/tokens
  - Clear typography hierarchy
  - Purposeful spacing and motion
- UX principles:
  - Minimize cognitive load
  - Clear next action at every step
  - Respectful health-oriented tone (no medical overclaiming)
- Include a concise medical disclaimer and safety guidance framing.

## Technical Expectations
- Use robust, maintainable architecture with clear module boundaries.
- Strict typing, reusable components, clean state management.
- Database schema for users, plans, fast sessions, check-ins, subscriptions, events.
- Migrations included.
- Seed data where useful for demos.
- API routes documented with request/response contracts.
- Security basics: auth hardening, input validation, rate limiting on sensitive endpoints.

## Analytics + Metrics (Implement Event Taxonomy)
Track at minimum:
- `landing_cta_clicked`
- `signup_started`
- `onboarding_completed`
- `first_fast_started`
- `first_fast_completed`
- `paywall_viewed`
- `trial_started`
- `subscription_started`
- `subscription_canceled`
- `weekly_active_user`

Define KPIs in `PRODUCT_REQUIREMENTS.md` with target benchmarks for:
- Visitor → signup conversion
- Signup → first fast start
- First fast start → day-7 retention
- Paywall view → trial start
- Trial start → paid conversion

## Execution Workflow (Mandatory)
1. Plan mode only:
   - Audit current codebase and tooling.
   - Propose architecture and phased implementation plan.
   - Write/update `IMPLEMENTATION_PLAN.md` with checkbox tasks and acceptance criteria.
2. Implement in vertical slices:
   - Landing + analytics baseline
   - Auth + onboarding
   - Timer + history
   - Paywall + subscriptions
   - Retention features
   - Hardening and QA
3. After each slice:
   - Run tests/lint/typecheck.
   - Update `memory.md` and `IMPLEMENTATION_PLAN.md`.
   - Commit with meaningful message.
4. Final pass:
   - Production readiness checklist
   - Known risks list
   - Launch checklist and post-launch iteration plan

## Deliverables Required
- Working app in codebase
- `memory.md` (continuously updated)
- `IMPLEMENTATION_PLAN.md` (continuously updated with statuses)
- `PRODUCT_REQUIREMENTS.md`
- `BRAND_SYSTEM.md`
- `MONETIZATION_STRATEGY.md`
- `TEST_STRATEGY.md`
- `LAUNCH_CHECKLIST.md`

## Standards
- Senior-level engineering quality only.
- No placeholder architecture.
- No skipped validation for critical flows.
- Explain tradeoffs when making decisions.
- If blocked, propose best fallback and continue.

Start now in Plan Mode and produce the initial planning files before coding.
