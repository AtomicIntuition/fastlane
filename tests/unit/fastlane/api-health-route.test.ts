import { afterEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('health route', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialNodeEnv = env.NODE_ENV;
  const initialDatabaseUrl = env.DATABASE_URL;
  const initialCronSecret = env.CRON_SECRET;
  const initialUserCookieSecret = env.USER_COOKIE_SECRET;
  const initialStripeSecretKey = env.STRIPE_SECRET_KEY;
  const initialStripeWebhookSecret = env.STRIPE_WEBHOOK_SECRET;
  const initialStripeMonthly = env.STRIPE_PRICE_MONTHLY;
  const initialStripeYearly = env.STRIPE_PRICE_YEARLY;
  const initialSentryDsn = env.SENTRY_DSN;
  const initialPublicSentryDsn = env.NEXT_PUBLIC_SENTRY_DSN;
  const initialAlertWebhook = env.SENTRY_ALERT_WEBHOOK_URL;
  const initialAlertEmail = env.ALERT_EMAIL_TO;
  const initialResendApiKey = env.RESEND_API_KEY;
  const initialAuthEmailFrom = env.FASTLANE_AUTH_EMAIL_FROM;

  afterEach(() => {
    env.NODE_ENV = initialNodeEnv;
    env.DATABASE_URL = initialDatabaseUrl;
    env.CRON_SECRET = initialCronSecret;
    env.USER_COOKIE_SECRET = initialUserCookieSecret;
    env.STRIPE_SECRET_KEY = initialStripeSecretKey;
    env.STRIPE_WEBHOOK_SECRET = initialStripeWebhookSecret;
    env.STRIPE_PRICE_MONTHLY = initialStripeMonthly;
    env.STRIPE_PRICE_YEARLY = initialStripeYearly;
    env.SENTRY_DSN = initialSentryDsn;
    env.NEXT_PUBLIC_SENTRY_DSN = initialPublicSentryDsn;
    env.SENTRY_ALERT_WEBHOOK_URL = initialAlertWebhook;
    env.ALERT_EMAIL_TO = initialAlertEmail;
    env.RESEND_API_KEY = initialResendApiKey;
    env.FASTLANE_AUTH_EMAIL_FROM = initialAuthEmailFrom;
  });

  it('returns ok in non-production even if readiness is incomplete', async () => {
    env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.readiness).toEqual(
      expect.objectContaining({
        readyForProduction: expect.any(Boolean),
        monitoring: expect.objectContaining({
          sentryServerDsnConfigured: expect.any(Boolean),
          sentryClientDsnConfigured: expect.any(Boolean),
          alertsRoutingConfigured: expect.any(Boolean),
          readyForProduction: expect.any(Boolean),
        }),
      }),
    );
  });

  it('returns degraded in production when readiness is incomplete', async () => {
    env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.readiness.readyForProduction).toBe(false);
  });

  it('returns ok in production when readiness is complete', async () => {
    env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://example';
    process.env.CRON_SECRET = 'cron-secret';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
    process.env.STRIPE_PRICE_MONTHLY = 'price_monthly';
    process.env.STRIPE_PRICE_YEARLY = 'price_yearly';
    process.env.SENTRY_DSN = 'https://abc123@o123.ingest.sentry.io/456';
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://def456@o123.ingest.sentry.io/789';
    process.env.SENTRY_ALERT_WEBHOOK_URL = 'https://hooks.example.com/alerts';
    process.env.RESEND_API_KEY = 're_test_123';
    process.env.FASTLANE_AUTH_EMAIL_FROM = 'FastLane <no-reply@fastlane.app>';

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.readiness.readyForProduction).toBe(true);
  });
});
