# FastLane Monitoring Alerts

This runbook defines the minimum production alert setup for FastLane.

## Required Environment Variables

- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- One alert route:
  - `SENTRY_ALERT_WEBHOOK_URL` (recommended), or
  - `ALERT_EMAIL_TO`

## Alert Policy (Sentry)

Create these alert rules in Sentry for production:

1. **Critical API error rate**
- Condition: error events in `production` for `level:error` crossing your threshold (for example, 10 in 5 minutes).
- Action: send to webhook/email route.

2. **Billing webhook failures**
- Condition: issue title contains `Webhook processing failed` in `production`.
- Action: send to webhook/email route with immediate notification.

3. **Admin replay failures**
- Condition: issue title contains `reprocess` or replay route failures in `production`.
- Action: notify webhook/email route.

## Verification

1. Deploy with all monitoring env vars set.
2. Call `/api/health` and confirm:
- `readiness.readyForProduction` is `true`.
- `readiness.monitoring.sentryServerDsnConfigured` is `true`.
- `readiness.monitoring.sentryClientDsnConfigured` is `true`.
- `readiness.monitoring.alertsRoutingConfigured` is `true`.
3. Trigger a controlled test error in staging/production and confirm alert delivery.

## Notes

- Do not expose webhook secrets to client-side code.
- Keep alert destinations owned by on-call responders.
