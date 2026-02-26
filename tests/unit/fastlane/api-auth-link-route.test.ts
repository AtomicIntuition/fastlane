import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FASTLANE_ACCOUNT_SESSION_COOKIE_NAME } from '@/lib/utils/fastlane-account-session-cookie';

const mocks = vi.hoisted(() => {
  const mockRequireFastLaneUserId = vi.fn();
  const mockEnsureFastLaneUser = vi.fn();
  const mockUnauthorized = vi.fn(() =>
    NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
  );
  const mockHasValidFastLaneCsrfRequest = vi.fn(() => true);

  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

  const mockUpdateWhere = vi.fn(async () => []);
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

  return {
    mockRequireFastLaneUserId,
    mockEnsureFastLaneUser,
    mockUnauthorized,
    mockHasValidFastLaneCsrfRequest,
    mockSelectLimit,
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
  };
});

vi.mock('@/lib/fastlane/server', () => ({
  requireFastLaneUserId: mocks.mockRequireFastLaneUserId,
  ensureFastLaneUser: mocks.mockEnsureFastLaneUser,
  unauthorized: mocks.mockUnauthorized,
}));

vi.mock('@/lib/utils/fastlane-csrf', () => ({
  hasValidFastLaneCsrfRequest: mocks.mockHasValidFastLaneCsrfRequest,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
  },
}));

import { GET, POST } from '@/app/api/fastlane/auth/link/route';

describe('FastLane auth link route', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialAccountSecret = env.FASTLANE_ACCOUNT_SESSION_SECRET;
  const initialUserCookieSecret = env.USER_COOKIE_SECRET;
  const initialCronSecret = env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockRequireFastLaneUserId.mockReturnValue('user_1');
    mocks.mockHasValidFastLaneCsrfRequest.mockReturnValue(true);
    mocks.mockEnsureFastLaneUser.mockResolvedValue({ userId: 'user_1', email: null });
    mocks.mockSelectLimit.mockResolvedValue([]);
    process.env.FASTLANE_ACCOUNT_SESSION_SECRET = 'test-account-session-secret';
    process.env.USER_COOKIE_SECRET = 'test-user-cookie-secret';
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  afterEach(() => {
    env.FASTLANE_ACCOUNT_SESSION_SECRET = initialAccountSecret;
    env.USER_COOKIE_SECRET = initialUserCookieSecret;
    env.CRON_SECRET = initialCronSecret;
  });

  it('returns unauthorized on GET when user id is missing', async () => {
    mocks.mockRequireFastLaneUserId.mockReturnValueOnce(null);
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/link', { method: 'GET' });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('returns linked status on GET', async () => {
    mocks.mockEnsureFastLaneUser.mockResolvedValueOnce({ userId: 'user_1', email: 'User@Example.com' });
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/link', { method: 'GET' });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ linked: true, email: 'user@example.com' });
  });

  it('rejects unknown query parameters on GET', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/link?foo=1', { method: 'GET' });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
  });

  it('returns unauthorized on POST when user id is missing', async () => {
    mocks.mockRequireFastLaneUserId.mockReturnValueOnce(null);
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 403 on POST when csrf validation fails', async () => {
    mocks.mockHasValidFastLaneCsrfRequest.mockReturnValueOnce(false);
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/CSRF validation failed/i);
  });

  it('rejects invalid email payload on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'invalid-email' }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid email/i);
  });

  it('rejects unknown fields on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', extra: true }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown field/i);
  });

  it('returns 409 when email is linked to another user', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([{ userId: 'user_2' }]);
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/already linked/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('is idempotent when email is already linked to current user', async () => {
    mocks.mockEnsureFastLaneUser.mockResolvedValueOnce({ userId: 'user_1', email: 'user@example.com' });
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'USER@example.com' }),
    });
    const response = await POST(request);
    const body = await response.json();
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, linked: true, email: 'user@example.com' });
    expect(setCookie).toContain(`${FASTLANE_ACCOUNT_SESSION_COOKIE_NAME}=`);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('links email on POST when available', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'User@Example.com' }),
    });
    const response = await POST(request);
    const body = await response.json();
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, linked: true, email: 'user@example.com' });
    expect(setCookie).toContain(`${FASTLANE_ACCOUNT_SESSION_COOKIE_NAME}=`);
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('rejects malformed content-length header on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/link', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': 'abc',
      },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-length header/i);
  });

  it('returns 500 when route throws unexpectedly', async () => {
    mocks.mockEnsureFastLaneUser.mockRejectedValueOnce(new Error('db down'));
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Unable to link account/i);
  });
});
