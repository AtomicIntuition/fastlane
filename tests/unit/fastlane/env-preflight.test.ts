import { describe, expect, it } from 'vitest';
import { runEnvPreflight } from '@/lib/utils/env-preflight';

const validEnv = {
  DATABASE_URL: 'postgresql://postgres:pw@example.com:5432/postgres',
  NEXT_PUBLIC_APP_URL: 'https://fastlane.app',
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_123',
  STRIPE_PRICE_MONTHLY: 'price_monthly',
  STRIPE_PRICE_YEARLY: 'price_yearly',
  RESEND_API_KEY: 're_123',
  FASTLANE_AUTH_EMAIL_FROM: 'FastLane <no-reply@fastlane.app>',
  SENTRY_DSN: 'https://abc123@o123.ingest.sentry.io/456',
  NEXT_PUBLIC_SENTRY_DSN: 'https://def456@o123.ingest.sentry.io/789',
  SENTRY_ALERT_WEBHOOK_URL: 'https://hooks.example.com/alerts',
  CRON_SECRET: '12345678901234567890123456789012',
  USER_COOKIE_SECRET: '22345678901234567890123456789012',
  FASTLANE_ACCOUNT_SESSION_SECRET: '32345678901234567890123456789012',
  FASTLANE_LOGIN_TOKEN_SECRET: '42345678901234567890123456789012',
} as unknown as NodeJS.ProcessEnv;

describe('env preflight', () => {
  it('passes in strict mode with a complete valid env', () => {
    const result = runEnvPreflight(validEnv, { strict: true });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('warns about missing values in non-strict mode', () => {
    const result = runEnvPreflight({} as NodeJS.ProcessEnv, { strict: false });
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('fails in strict mode when required values are missing', () => {
    const result = runEnvPreflight({} as NodeJS.ProcessEnv, { strict: true });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('DATABASE_URL'))).toBe(true);
  });

  it('fails when secret lengths are too short', () => {
    const result = runEnvPreflight(
      {
        ...validEnv,
        CRON_SECRET: 'short-secret',
      } as NodeJS.ProcessEnv,
      { strict: true },
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('CRON_SECRET must be at least 32 characters.');
  });

  it('fails strict mode when app url is not https', () => {
    const result = runEnvPreflight(
      {
        ...validEnv,
        NEXT_PUBLIC_APP_URL: 'http://fastlane.app',
      } as NodeJS.ProcessEnv,
      { strict: true },
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('NEXT_PUBLIC_APP_URL must use https:// in strict mode.');
  });
});
