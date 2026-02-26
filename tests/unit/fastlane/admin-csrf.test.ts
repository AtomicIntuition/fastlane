import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_CSRF_COOKIE_NAME,
  ADMIN_CSRF_HEADER_NAME,
  generateAdminCsrfToken,
  hasValidAdminCsrfRequest,
} from '@/lib/utils/admin-csrf';
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/utils/admin-session-cookie';

describe('admin csrf', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialNodeEnv = env.NODE_ENV;
  const initialCronSecret = env.CRON_SECRET;
  const initialAdminSessionSecret = env.ADMIN_SESSION_SECRET;
  const initialAdminCsrfSecret = env.ADMIN_CSRF_SECRET;
  const initialDisableFlag = env.FASTLANE_DISABLE_ADMIN_CSRF_PROTECTION;

  beforeEach(() => {
    env.NODE_ENV = 'production';
    process.env.CRON_SECRET = 'cron-secret';
    process.env.ADMIN_SESSION_SECRET = 'admin-session-secret';
    process.env.ADMIN_CSRF_SECRET = 'admin-csrf-secret';
    delete process.env.FASTLANE_DISABLE_ADMIN_CSRF_PROTECTION;
  });

  afterEach(() => {
    env.NODE_ENV = initialNodeEnv;
    env.CRON_SECRET = initialCronSecret;
    env.ADMIN_SESSION_SECRET = initialAdminSessionSecret;
    env.ADMIN_CSRF_SECRET = initialAdminCsrfSecret;
    env.FASTLANE_DISABLE_ADMIN_CSRF_PROTECTION = initialDisableFlag;
  });

  it('accepts valid cookie-based csrf request', () => {
    const sessionValue = '1700000000000.signature';
    const token = generateAdminCsrfToken(sessionValue);
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE_NAME}=${sessionValue}; ${ADMIN_CSRF_COOKIE_NAME}=${token}`,
        [ADMIN_CSRF_HEADER_NAME]: token,
      },
    });

    expect(hasValidAdminCsrfRequest(request)).toBe(true);
  });

  it('rejects missing csrf header for cookie-based auth', () => {
    const sessionValue = '1700000000000.signature';
    const token = generateAdminCsrfToken(sessionValue);
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE_NAME}=${sessionValue}; ${ADMIN_CSRF_COOKIE_NAME}=${token}`,
      },
    });

    expect(hasValidAdminCsrfRequest(request)).toBe(false);
  });

  it('allows bearer-admin requests without csrf token', () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: {
        authorization: 'Bearer cron-secret',
      },
    });

    expect(hasValidAdminCsrfRequest(request)).toBe(true);
  });
});
