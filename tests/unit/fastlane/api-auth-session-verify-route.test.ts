import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FASTLANE_ACCOUNT_SESSION_COOKIE_NAME } from '@/lib/utils/fastlane-account-session-cookie';
import { createFastLaneLoginToken } from '@/lib/utils/fastlane-auth-token';

const mocks = vi.hoisted(() => {
  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));
  const mockInsertReturning = vi.fn();
  const mockInsertOnConflictDoNothing = vi.fn(() => ({ returning: mockInsertReturning }));
  const mockInsertValues = vi.fn(() => ({ onConflictDoNothing: mockInsertOnConflictDoNothing }));
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
  return {
    mockSelectLimit,
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockInsertReturning,
    mockInsertOnConflictDoNothing,
    mockInsertValues,
    mockInsert,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.mockSelect,
    insert: mocks.mockInsert,
  },
}));

import { POST } from '@/app/api/fastlane/auth/session/verify/route';

describe('FastLane auth session verify route', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialLoginSecret = env.FASTLANE_LOGIN_TOKEN_SECRET;
  const initialAccountSecret = env.FASTLANE_ACCOUNT_SESSION_SECRET;
  const initialUserCookieSecret = env.USER_COOKIE_SECRET;
  const initialCronSecret = env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FASTLANE_LOGIN_TOKEN_SECRET = 'login-token-secret';
    process.env.FASTLANE_ACCOUNT_SESSION_SECRET = 'account-session-secret';
    process.env.USER_COOKIE_SECRET = 'user-cookie-secret';
    process.env.CRON_SECRET = 'cron-secret';
    mocks.mockSelectLimit.mockResolvedValue([{ userId: 'user_1', email: 'user@example.com' }]);
    mocks.mockInsertReturning.mockResolvedValue([{ id: 'replay_1' }]);
  });

  afterEach(() => {
    env.FASTLANE_LOGIN_TOKEN_SECRET = initialLoginSecret;
    env.FASTLANE_ACCOUNT_SESSION_SECRET = initialAccountSecret;
    env.USER_COOKIE_SECRET = initialUserCookieSecret;
    env.CRON_SECRET = initialCronSecret;
  });

  it('verifies token and sets account session cookie', async () => {
    const token = createFastLaneLoginToken({ userId: 'user_1', email: 'user@example.com' });
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/session/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const response = await POST(request);
    const body = await response.json();
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(body.authenticated).toBe(true);
    expect(setCookie).toContain(`${FASTLANE_ACCOUNT_SESSION_COOKIE_NAME}=`);
  });

  it('rejects invalid token', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/session/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'invalid' }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid or expired login token/i);
  });

  it('rejects token when account record does not match payload', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([]);
    const token = createFastLaneLoginToken({ userId: 'user_1', email: 'user@example.com' });
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/session/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid or expired login token/i);
  });

  it('rejects replayed login token after first successful verification', async () => {
    const token = createFastLaneLoginToken({ userId: 'user_1', email: 'user@example.com' });
    mocks.mockInsertReturning.mockResolvedValueOnce([{ id: 'replay_1' }]).mockResolvedValueOnce([]);

    const first = new NextRequest('http://localhost:3000/api/fastlane/auth/session/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const firstResponse = await POST(first);
    expect(firstResponse.status).toBe(200);

    const second = new NextRequest('http://localhost:3000/api/fastlane/auth/session/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const secondResponse = await POST(second);
    const secondBody = await secondResponse.json();

    expect(secondResponse.status).toBe(409);
    expect(secondBody.error).toMatch(/already used/i);
  });
});
