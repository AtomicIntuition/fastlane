import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  FASTLANE_CSRF_COOKIE_NAME,
  FASTLANE_CSRF_HEADER_NAME,
  generateFastLaneCsrfToken,
  hasValidFastLaneCsrfRequest,
  shouldEnforceFastLaneCsrf,
  verifyFastLaneCsrfToken,
} from '@/lib/utils/fastlane-csrf';

function buildRequest(cookieToken?: string, headerToken?: string) {
  return {
    cookies: {
      get: (name: string) =>
        name === FASTLANE_CSRF_COOKIE_NAME && cookieToken ? { value: cookieToken } : undefined,
    },
    headers: {
      get: (name: string) =>
        name.toLowerCase() === FASTLANE_CSRF_HEADER_NAME && headerToken ? headerToken : null,
    },
  };
}

describe('fastlane csrf utilities', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialNodeEnv = env.NODE_ENV;
  const initialCsrfSecret = env.FASTLANE_CSRF_SECRET;
  const initialUserCookieSecret = env.USER_COOKIE_SECRET;
  const initialCronSecret = env.CRON_SECRET;
  const initialDisableFlag = env.FASTLANE_DISABLE_CSRF_PROTECTION;

  beforeEach(() => {
    process.env.FASTLANE_CSRF_SECRET = 'test-fastlane-csrf-secret';
    process.env.USER_COOKIE_SECRET = 'test-user-cookie-secret';
    process.env.CRON_SECRET = 'test-cron-secret';
    delete process.env.FASTLANE_DISABLE_CSRF_PROTECTION;
    env.NODE_ENV = 'test';
  });

  afterEach(() => {
    env.NODE_ENV = initialNodeEnv;
    env.FASTLANE_CSRF_SECRET = initialCsrfSecret;
    env.USER_COOKIE_SECRET = initialUserCookieSecret;
    env.CRON_SECRET = initialCronSecret;
    env.FASTLANE_DISABLE_CSRF_PROTECTION = initialDisableFlag;
  });

  it('generates and verifies a token for the same user', () => {
    const userId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
    const token = generateFastLaneCsrfToken(userId);
    expect(verifyFastLaneCsrfToken(token, userId)).toBe(true);
  });

  it('rejects token when verified against a different user', () => {
    const token = generateFastLaneCsrfToken('d290f1ee-6c54-4b01-90e6-d701748f0851');
    expect(verifyFastLaneCsrfToken(token, '1f4e0e58-744f-4f58-9f48-92e0bf9fc36f')).toBe(false);
  });

  it('does not enforce csrf outside production by default', () => {
    env.NODE_ENV = 'test';
    const request = buildRequest(undefined, undefined);
    expect(shouldEnforceFastLaneCsrf()).toBe(false);
    expect(hasValidFastLaneCsrfRequest(request, 'd290f1ee-6c54-4b01-90e6-d701748f0851')).toBe(true);
  });

  it('enforces csrf in production and requires matching header+cookie', () => {
    env.NODE_ENV = 'production';
    const userId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
    const token = generateFastLaneCsrfToken(userId);
    const validRequest = buildRequest(token, token);
    const invalidRequest = buildRequest(token, undefined);

    expect(shouldEnforceFastLaneCsrf()).toBe(true);
    expect(hasValidFastLaneCsrfRequest(validRequest, userId)).toBe(true);
    expect(hasValidFastLaneCsrfRequest(invalidRequest, userId)).toBe(false);
  });

  it('allows explicit csrf disable flag in production', () => {
    env.NODE_ENV = 'production';
    process.env.FASTLANE_DISABLE_CSRF_PROTECTION = 'true';
    const request = buildRequest(undefined, undefined);
    expect(shouldEnforceFastLaneCsrf()).toBe(false);
    expect(hasValidFastLaneCsrfRequest(request, 'd290f1ee-6c54-4b01-90e6-d701748f0851')).toBe(true);
  });
});
