import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFastLaneLoginToken, verifyFastLaneLoginToken } from '@/lib/utils/fastlane-auth-token';

describe('fastlane auth token utils', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialLoginSecret = env.FASTLANE_LOGIN_TOKEN_SECRET;
  const initialAccountSecret = env.FASTLANE_ACCOUNT_SESSION_SECRET;
  const initialUserCookieSecret = env.USER_COOKIE_SECRET;
  const initialCronSecret = env.CRON_SECRET;

  beforeEach(() => {
    process.env.FASTLANE_LOGIN_TOKEN_SECRET = 'test-login-token-secret';
    process.env.FASTLANE_ACCOUNT_SESSION_SECRET = 'test-account-session-secret';
    process.env.USER_COOKIE_SECRET = 'test-user-cookie-secret';
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  afterEach(() => {
    env.FASTLANE_LOGIN_TOKEN_SECRET = initialLoginSecret;
    env.FASTLANE_ACCOUNT_SESSION_SECRET = initialAccountSecret;
    env.USER_COOKIE_SECRET = initialUserCookieSecret;
    env.CRON_SECRET = initialCronSecret;
  });

  it('creates and verifies a valid login token', () => {
    const now = 1_700_000_000_000;
    const token = createFastLaneLoginToken({
      userId: 'user_1',
      email: 'User@example.com',
      nowMs: now,
    });
    const verified = verifyFastLaneLoginToken(token, now + 1_000);
    expect(verified).toEqual({
      userId: 'user_1',
      email: 'user@example.com',
      expiresAtMs: now + 600_000,
    });
  });

  it('rejects tampered login token', () => {
    const token = createFastLaneLoginToken({ userId: 'user_1', email: 'user@example.com' });
    expect(verifyFastLaneLoginToken(`${token}x`)).toBeNull();
  });

  it('rejects expired token', () => {
    const now = 1_700_000_000_000;
    const token = createFastLaneLoginToken({ userId: 'user_1', email: 'user@example.com', nowMs: now });
    expect(verifyFastLaneLoginToken(token, now + 700_000)).toBeNull();
  });
});
