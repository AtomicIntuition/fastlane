import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFastLaneAccountSessionCookieValue,
  FASTLANE_ACCOUNT_SESSION_COOKIE_NAME,
} from '@/lib/utils/fastlane-account-session-cookie';

const mocks = vi.hoisted(() => {
  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));
  return {
    mockSelectLimit,
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.mockSelect,
  },
}));

import { DELETE, GET } from '@/app/api/fastlane/auth/session/route';

describe('FastLane auth session route', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialAccountSecret = env.FASTLANE_ACCOUNT_SESSION_SECRET;
  const initialUserCookieSecret = env.USER_COOKIE_SECRET;
  const initialCronSecret = env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FASTLANE_ACCOUNT_SESSION_SECRET = 'account-session-secret';
    process.env.USER_COOKIE_SECRET = 'user-cookie-secret';
    process.env.CRON_SECRET = 'cron-secret';
    mocks.mockSelectLimit.mockResolvedValue([{ userId: 'user_1', email: 'user@example.com' }]);
  });

  afterEach(() => {
    env.FASTLANE_ACCOUNT_SESSION_SECRET = initialAccountSecret;
    env.USER_COOKIE_SECRET = initialUserCookieSecret;
    env.CRON_SECRET = initialCronSecret;
  });

  it('returns unauthenticated when session cookie is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/session', { method: 'GET' });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ authenticated: false });
  });

  it('returns authenticated session details with valid cookie', async () => {
    const cookieValue = createFastLaneAccountSessionCookieValue('user_1');
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/session', {
      method: 'GET',
      headers: { cookie: `${FASTLANE_ACCOUNT_SESSION_COOKIE_NAME}=${cookieValue}` },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ authenticated: true, userId: 'user_1', email: 'user@example.com' });
  });

  it('clears stale session cookie when user no longer exists', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([]);
    const cookieValue = createFastLaneAccountSessionCookieValue('user_1');
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/session', {
      method: 'GET',
      headers: { cookie: `${FASTLANE_ACCOUNT_SESSION_COOKIE_NAME}=${cookieValue}` },
    });
    const response = await GET(request);
    const body = await response.json();
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(body).toEqual({ authenticated: false });
    expect(setCookie).toContain(`${FASTLANE_ACCOUNT_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('Max-Age=0');
  });

  it('clears account session on DELETE', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/session', {
      method: 'DELETE',
    });
    const response = await DELETE(request);
    const body = await response.json();
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(setCookie).toContain(`${FASTLANE_ACCOUNT_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('Max-Age=0');
  });
});
