import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createFastLaneAccountSessionCookieValue,
  FASTLANE_ACCOUNT_SESSION_COOKIE_NAME,
  getFastLaneAccountSessionUserIdFromRequest,
  verifyFastLaneAccountSessionCookieValue,
} from '@/lib/utils/fastlane-account-session-cookie';

describe('fastlane account session cookie utils', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialAccountSecret = env.FASTLANE_ACCOUNT_SESSION_SECRET;
  const initialUserCookieSecret = env.USER_COOKIE_SECRET;
  const initialCronSecret = env.CRON_SECRET;

  beforeEach(() => {
    process.env.FASTLANE_ACCOUNT_SESSION_SECRET = 'account-session-secret';
    process.env.USER_COOKIE_SECRET = 'user-cookie-secret';
    process.env.CRON_SECRET = 'cron-secret';
  });

  afterEach(() => {
    env.FASTLANE_ACCOUNT_SESSION_SECRET = initialAccountSecret;
    env.USER_COOKIE_SECRET = initialUserCookieSecret;
    env.CRON_SECRET = initialCronSecret;
  });

  it('creates and verifies a valid session cookie', () => {
    const now = 1_700_000_000_000;
    const value = createFastLaneAccountSessionCookieValue(
      'd290f1ee-6c54-4b01-90e6-d701748f0851',
      now,
    );
    const verified = verifyFastLaneAccountSessionCookieValue(value, now + 60_000);
    expect(verified).toBe('d290f1ee-6c54-4b01-90e6-d701748f0851');
  });

  it('rejects tampered account session cookie', () => {
    const value = createFastLaneAccountSessionCookieValue('d290f1ee-6c54-4b01-90e6-d701748f0851');
    expect(verifyFastLaneAccountSessionCookieValue(`${value}x`)).toBeNull();
  });

  it('rejects malformed account session cookie format', () => {
    expect(verifyFastLaneAccountSessionCookieValue('user.bad-format')).toBeNull();
  });

  it('extracts valid account session user id from request cookie', () => {
    const value = createFastLaneAccountSessionCookieValue('d290f1ee-6c54-4b01-90e6-d701748f0851');
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      headers: {
        cookie: `${FASTLANE_ACCOUNT_SESSION_COOKIE_NAME}=${value}`,
      },
    });
    expect(getFastLaneAccountSessionUserIdFromRequest(request)).toBe(
      'd290f1ee-6c54-4b01-90e6-d701748f0851',
    );
  });

  it('fails closed when signing secrets are missing', () => {
    delete process.env.FASTLANE_ACCOUNT_SESSION_SECRET;
    delete process.env.USER_COOKIE_SECRET;
    delete process.env.CRON_SECRET;
    expect(
      verifyFastLaneAccountSessionCookieValue(
        'd290f1ee-6c54-4b01-90e6-d701748f0851.4102444800000.deadbeefdeadbeefdeadbeef',
      ),
    ).toBeNull();
  });
});
