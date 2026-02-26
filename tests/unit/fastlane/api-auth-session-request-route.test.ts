import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockThrottleLimit = vi.fn();
  const mockThrottleWhere = vi.fn(() => ({ limit: mockThrottleLimit }));
  const mockUserLimit = vi.fn();
  const mockUserWhere = vi.fn(() => ({ limit: mockUserLimit }));

  let selectCount = 0;
  const mockSelect = vi.fn(() => {
    selectCount += 1;
    if (selectCount === 1) {
      return { from: vi.fn(() => ({ where: mockThrottleWhere })) };
    }
    return { from: vi.fn(() => ({ where: mockUserWhere })) };
  });

  const resetSelectCount = () => {
    selectCount = 0;
  };

  const mockInsertOnConflictDoUpdate = vi.fn(async () => []);
  const mockInsertValues = vi.fn(() => ({ onConflictDoUpdate: mockInsertOnConflictDoUpdate }));
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
  return {
    mockThrottleLimit,
    mockThrottleWhere,
    mockUserLimit,
    mockUserWhere,
    mockSelect,
    resetSelectCount,
    mockInsert,
    mockInsertValues,
    mockInsertOnConflictDoUpdate,
    mockIsFastLaneAuthEmailConfigured: vi.fn(),
    mockSendFastLaneLoginEmail: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.mockSelect,
    insert: mocks.mockInsert,
  },
}));

vi.mock('@/lib/fastlane/auth-email', () => ({
  isFastLaneAuthEmailConfigured: mocks.mockIsFastLaneAuthEmailConfigured,
  sendFastLaneLoginEmail: mocks.mockSendFastLaneLoginEmail,
}));

import { POST } from '@/app/api/fastlane/auth/session/request/route';

describe('FastLane auth session request route', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialNodeEnv = env.NODE_ENV;
  const initialLoginSecret = env.FASTLANE_LOGIN_TOKEN_SECRET;
  const initialAccountSecret = env.FASTLANE_ACCOUNT_SESSION_SECRET;
  const initialUserCookieSecret = env.USER_COOKIE_SECRET;
  const initialCronSecret = env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetSelectCount();
    mocks.mockThrottleLimit.mockResolvedValue([]);
    mocks.mockUserLimit.mockResolvedValue([{ userId: 'user_1', email: 'user@example.com' }]);
    mocks.mockInsertOnConflictDoUpdate.mockResolvedValue([]);
    mocks.mockIsFastLaneAuthEmailConfigured.mockReturnValue(false);
    mocks.mockSendFastLaneLoginEmail.mockResolvedValue(undefined);
    env.NODE_ENV = 'test';
    process.env.FASTLANE_LOGIN_TOKEN_SECRET = 'login-token-secret';
    process.env.FASTLANE_ACCOUNT_SESSION_SECRET = 'account-session-secret';
    process.env.USER_COOKIE_SECRET = 'user-cookie-secret';
    process.env.CRON_SECRET = 'cron-secret';
  });

  afterEach(() => {
    env.NODE_ENV = initialNodeEnv;
    env.FASTLANE_LOGIN_TOKEN_SECRET = initialLoginSecret;
    env.FASTLANE_ACCOUNT_SESSION_SECRET = initialAccountSecret;
    env.USER_COOKIE_SECRET = initialUserCookieSecret;
    env.CRON_SECRET = initialCronSecret;
  });

  it('returns dev login token in non-production when email exists', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/session/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'User@example.com' }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.devLoginToken).toBe('string');
    expect(mocks.mockSendFastLaneLoginEmail).not.toHaveBeenCalled();
  });

  it('returns generic ok in production and sends auth email when configured', async () => {
    env.NODE_ENV = 'production';
    mocks.mockIsFastLaneAuthEmailConfigured.mockReturnValueOnce(true);
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/session/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.devLoginToken).toBeUndefined();
    expect(mocks.mockSendFastLaneLoginEmail).toHaveBeenCalledTimes(1);
  });

  it('returns generic ok when no account exists for email', async () => {
    mocks.mockUserLimit.mockResolvedValueOnce([]);
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/session/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'missing@example.com' }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(mocks.mockSendFastLaneLoginEmail).not.toHaveBeenCalled();
  });

  it('returns throttled response when request is within cooldown window', async () => {
    mocks.mockThrottleLimit.mockResolvedValueOnce([{ lastRequestedAt: new Date() }]);
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/session/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.throttled).toBe(true);
    expect(typeof body.retryAfterSeconds).toBe('number');
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockSendFastLaneLoginEmail).not.toHaveBeenCalled();
  });

  it('returns 500 in production when auth email delivery is not configured', async () => {
    env.NODE_ENV = 'production';
    mocks.mockIsFastLaneAuthEmailConfigured.mockReturnValueOnce(false);

    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/session/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Auth email delivery not configured/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
  });

  it('rejects invalid email payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/session/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'invalid' }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid email/i);
  });

  it('rejects unknown query parameters', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/session/request?foo=bar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
  });
});
