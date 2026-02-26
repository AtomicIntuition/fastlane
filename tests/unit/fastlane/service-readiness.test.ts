import { describe, expect, it } from 'vitest';
import { getServiceReadiness } from '@/lib/utils/service-readiness';

describe('service readiness', () => {
  it('is production-ready when all required config is set', () => {
    const readiness = getServiceReadiness({
      DATABASE_URL: 'postgresql://example',
      CRON_SECRET: 'cron-secret',
      RESEND_API_KEY: 're_test_123',
      FASTLANE_AUTH_EMAIL_FROM: 'FastLane <no-reply@fastlane.app>',
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_123',
      STRIPE_PRICE_MONTHLY: 'price_monthly',
      STRIPE_PRICE_YEARLY: 'price_yearly',
      SENTRY_DSN: 'https://abc123@o123.ingest.sentry.io/456',
      NEXT_PUBLIC_SENTRY_DSN: 'https://def456@o123.ingest.sentry.io/789',
      SENTRY_ALERT_WEBHOOK_URL: 'https://hooks.example.com/alerts',
    } as unknown as NodeJS.ProcessEnv);

    expect(readiness.databaseConfigured).toBe(true);
    expect(readiness.authConfigured).toBe(true);
    expect(readiness.authEmailConfigured).toBe(true);
    expect(readiness.billingConfigured).toBe(true);
    expect(readiness.monitoring.readyForProduction).toBe(true);
    expect(readiness.readyForProduction).toBe(true);
  });

  it('is not production-ready when billing config is missing', () => {
    const readiness = getServiceReadiness({
      DATABASE_URL: 'postgresql://example',
      CRON_SECRET: 'cron-secret',
      RESEND_API_KEY: 're_test_123',
      FASTLANE_AUTH_EMAIL_FROM: 'FastLane <no-reply@fastlane.app>',
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_123',
      STRIPE_PRICE_MONTHLY: 'price_monthly',
      SENTRY_DSN: 'https://abc123@o123.ingest.sentry.io/456',
      NEXT_PUBLIC_SENTRY_DSN: 'https://def456@o123.ingest.sentry.io/789',
      ALERT_EMAIL_TO: 'oncall@example.com',
    } as unknown as NodeJS.ProcessEnv);

    expect(readiness.billingConfigured).toBe(false);
    expect(readiness.readyForProduction).toBe(false);
  });

  it('is not production-ready when auth email config is missing', () => {
    const readiness = getServiceReadiness({
      DATABASE_URL: 'postgresql://example',
      CRON_SECRET: 'cron-secret',
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_123',
      STRIPE_PRICE_MONTHLY: 'price_monthly',
      STRIPE_PRICE_YEARLY: 'price_yearly',
      SENTRY_DSN: 'https://abc123@o123.ingest.sentry.io/456',
      NEXT_PUBLIC_SENTRY_DSN: 'https://def456@o123.ingest.sentry.io/789',
      SENTRY_ALERT_WEBHOOK_URL: 'https://hooks.example.com/alerts',
    } as unknown as NodeJS.ProcessEnv);

    expect(readiness.authEmailConfigured).toBe(false);
    expect(readiness.readyForProduction).toBe(false);
  });
});
