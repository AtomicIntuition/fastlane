import { describe, expect, it } from 'vitest';
import { getMonitoringReadiness } from '@/lib/utils/monitoring';

describe('monitoring readiness', () => {
  it('returns ready when sentry and alert routing are configured', () => {
    const readiness = getMonitoringReadiness({
      SENTRY_DSN: 'https://abc123@o123.ingest.sentry.io/456',
      NEXT_PUBLIC_SENTRY_DSN: 'https://def456@o123.ingest.sentry.io/789',
      SENTRY_ALERT_WEBHOOK_URL: 'https://hooks.example.com/fastlane-alerts',
    } as unknown as NodeJS.ProcessEnv);

    expect(readiness.sentryServerDsnConfigured).toBe(true);
    expect(readiness.sentryClientDsnConfigured).toBe(true);
    expect(readiness.alertsRoutingConfigured).toBe(true);
    expect(readiness.readyForProduction).toBe(true);
  });

  it('returns not ready when alert routing is missing', () => {
    const readiness = getMonitoringReadiness({
      SENTRY_DSN: 'https://abc123@o123.ingest.sentry.io/456',
      NEXT_PUBLIC_SENTRY_DSN: 'https://def456@o123.ingest.sentry.io/789',
    } as unknown as NodeJS.ProcessEnv);

    expect(readiness.sentryServerDsnConfigured).toBe(true);
    expect(readiness.sentryClientDsnConfigured).toBe(true);
    expect(readiness.alertsRoutingConfigured).toBe(false);
    expect(readiness.readyForProduction).toBe(false);
  });

  it('returns not ready when sentry DSNs are placeholders', () => {
    const readiness = getMonitoringReadiness({
      SENTRY_DSN: 'https://...@sentry.io/...',
      NEXT_PUBLIC_SENTRY_DSN: 'https://...@sentry.io/...',
      ALERT_EMAIL_TO: 'oncall@example.com',
    } as unknown as NodeJS.ProcessEnv);

    expect(readiness.sentryServerDsnConfigured).toBe(false);
    expect(readiness.sentryClientDsnConfigured).toBe(false);
    expect(readiness.alertsRoutingConfigured).toBe(true);
    expect(readiness.readyForProduction).toBe(false);
  });
});
