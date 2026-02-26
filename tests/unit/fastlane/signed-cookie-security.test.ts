import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';

import {
  COOKIE_NAME,
  generateSignedUserId,
  getUserIdFromSignedCookieValue,
  getUserIdFromRequest,
  verifySignedCookie,
} from '@/lib/utils/signed-cookie';

function buildRequest(cookieValue?: string, headerUserId?: string) {
  return {
    cookies: {
      get: (name: string) =>
        name === COOKIE_NAME && cookieValue ? { value: cookieValue } : undefined,
    },
    headers: {
      get: (name: string) => (name === 'x-user-id' ? headerUserId ?? null : null),
    },
  };
}

describe('signed cookie user-id extraction hardening', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialNodeEnv = env.NODE_ENV;
  const initialUserCookieSecret = env.USER_COOKIE_SECRET;
  const initialCronSecret = env.CRON_SECRET;

  beforeEach(() => {
    process.env.USER_COOKIE_SECRET = 'test-user-cookie-secret';
    delete process.env.ALLOW_LEGACY_USER_ID_HEADER;
    delete process.env.ALLOW_LEGACY_UNSIGNED_USER_COOKIE;
  });

  afterEach(() => {
    env.NODE_ENV = initialNodeEnv;
    env.USER_COOKIE_SECRET = initialUserCookieSecret;
    env.CRON_SECRET = initialCronSecret;
  });

  it('rejects x-user-id header in production by default', () => {
    env.NODE_ENV = 'production';
    const request = buildRequest(undefined, 'spoofed-user-id');
    expect(getUserIdFromRequest(request)).toBeNull();
  });

  it('allows x-user-id header in production when explicitly enabled', () => {
    env.NODE_ENV = 'production';
    process.env.ALLOW_LEGACY_USER_ID_HEADER = 'true';
    const request = buildRequest(undefined, 'd290f1ee-6c54-4b01-90e6-d701748f0851');
    expect(getUserIdFromRequest(request)).toBe('d290f1ee-6c54-4b01-90e6-d701748f0851');
  });

  it('trims x-user-id header in production when legacy header mode is enabled', () => {
    env.NODE_ENV = 'production';
    process.env.ALLOW_LEGACY_USER_ID_HEADER = 'true';
    const request = buildRequest(undefined, '  d290f1ee-6c54-4b01-90e6-d701748f0851  ');
    expect(getUserIdFromRequest(request)).toBe('d290f1ee-6c54-4b01-90e6-d701748f0851');
  });

  it('rejects blank x-user-id header in production even when legacy header mode is enabled', () => {
    env.NODE_ENV = 'production';
    process.env.ALLOW_LEGACY_USER_ID_HEADER = 'true';
    const request = buildRequest(undefined, '   ');
    expect(getUserIdFromRequest(request)).toBeNull();
  });

  it('rejects overlong x-user-id header in production even when legacy header mode is enabled', () => {
    env.NODE_ENV = 'production';
    process.env.ALLOW_LEGACY_USER_ID_HEADER = 'true';
    const request = buildRequest(undefined, 'u'.repeat(101));
    expect(getUserIdFromRequest(request)).toBeNull();
  });

  it('rejects non-uuid x-user-id header in production even when legacy header mode is enabled', () => {
    env.NODE_ENV = 'production';
    process.env.ALLOW_LEGACY_USER_ID_HEADER = 'true';
    const request = buildRequest(undefined, 'legacy-user-id');
    expect(getUserIdFromRequest(request)).toBeNull();
  });

  it('still accepts valid signed cookie in production', () => {
    env.NODE_ENV = 'production';
    const signed = generateSignedUserId();
    const expectedUserId = getUserIdFromSignedCookieValue(signed);
    const request = buildRequest(signed);
    expect(getUserIdFromRequest(request)).toBe(expectedUserId);
  });

  it('rejects legacy unsigned cookie in production by default', () => {
    env.NODE_ENV = 'production';
    const request = buildRequest('d290f1ee-6c54-4b01-90e6-d701748f0851');
    expect(getUserIdFromRequest(request)).toBeNull();
  });

  it('allows legacy unsigned UUID cookie in production when explicitly enabled', () => {
    env.NODE_ENV = 'production';
    process.env.ALLOW_LEGACY_UNSIGNED_USER_COOKIE = 'true';
    const legacyUserId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
    const request = buildRequest(legacyUserId);
    expect(getUserIdFromRequest(request)).toBe(legacyUserId);
  });

  it('rejects malformed legacy unsigned cookie even when legacy mode enabled', () => {
    env.NODE_ENV = 'production';
    process.env.ALLOW_LEGACY_UNSIGNED_USER_COOKIE = 'true';
    const request = buildRequest('not-a-uuid');
    expect(getUserIdFromRequest(request)).toBeNull();
  });

  it('fails closed when verifying a signed cookie without configured secrets', () => {
    delete process.env.USER_COOKIE_SECRET;
    delete process.env.CRON_SECRET;
    const cookie = 'd290f1ee-6c54-4b01-90e6-d701748f0851.deadbeefdeadbeef';
    expect(verifySignedCookie(cookie)).toBeNull();
  });

  it('rejects signed cookie with overlong user id payload', () => {
    const cookie = `${'u'.repeat(101)}.deadbeefdeadbeef`;
    expect(verifySignedCookie(cookie)).toBeNull();
  });

  it('rejects oversized signed cookie value before parsing', () => {
    const cookie = `${'u'.repeat(513)}.deadbeefdeadbeef`;
    expect(verifySignedCookie(cookie)).toBeNull();
  });

  it('rejects signed cookie with non-hex hmac segment', () => {
    const cookie = 'd290f1ee-6c54-4b01-90e6-d701748f0851.nothexsignature!!';
    expect(verifySignedCookie(cookie)).toBeNull();
  });

  it('rejects signed cookie with non-uuid user id payload', () => {
    const cookie = 'legacy-user-id.deadbeefdeadbeef';
    expect(verifySignedCookie(cookie)).toBeNull();
  });

  it('accepts legacy two-part signed cookies for migration compatibility', () => {
    const userId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
    const hmac = createHmac('sha256', process.env.USER_COOKIE_SECRET!)
      .update(userId)
      .digest('hex')
      .slice(0, 16);
    const cookie = `${userId}.${hmac}`;
    expect(verifySignedCookie(cookie)).toBe(userId);
  });

  it('rejects expired three-part signed cookies', () => {
    const originalNow = Date.now;
    Date.now = () => 2_000_000_000_000;

    try {
      process.env.USER_COOKIE_MAX_AGE_SECONDS = '60';
      const signed = generateSignedUserId();

      Date.now = () => 2_000_000_200_000;
      expect(verifySignedCookie(signed)).toBeNull();
    } finally {
      Date.now = originalNow;
      delete process.env.USER_COOKIE_MAX_AGE_SECONDS;
    }
  });

  it('fails closed for signed-cookie extraction when secrets are missing', () => {
    delete process.env.USER_COOKIE_SECRET;
    delete process.env.CRON_SECRET;
    const request = buildRequest('d290f1ee-6c54-4b01-90e6-d701748f0851.deadbeefdeadbeef');
    expect(getUserIdFromRequest(request)).toBeNull();
  });
});
