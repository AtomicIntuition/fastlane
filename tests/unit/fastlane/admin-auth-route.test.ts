import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockIsAdminAuthorized: vi.fn(),
  mockCreateAdminSessionCookieValue: vi.fn(),
  mockGenerateAdminCsrfToken: vi.fn(),
}));

vi.mock('@/lib/utils/admin-session-cookie', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/admin-session-cookie')>('@/lib/utils/admin-session-cookie');
  return {
    ...actual,
    isAdminAuthorized: mocks.mockIsAdminAuthorized,
    createAdminSessionCookieValue: mocks.mockCreateAdminSessionCookieValue,
  };
});

vi.mock('@/lib/utils/admin-csrf', () => ({
  ADMIN_CSRF_COOKIE_NAME: 'fastlaneAdminCsrf',
  generateAdminCsrfToken: mocks.mockGenerateAdminCsrfToken,
}));

import { DELETE, GET, POST } from '@/app/api/admin/fastlane/auth/route';
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/utils/admin-session-cookie';

describe('admin fastlane auth route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
    mocks.mockIsAdminAuthorized.mockReturnValue(true);
    mocks.mockCreateAdminSessionCookieValue.mockReturnValue('cookie-value');
    mocks.mockGenerateAdminCsrfToken.mockReturnValue('csrf-token-value');
  });

  it('returns authenticated=false when helper says unauthorized', async () => {
    mocks.mockIsAdminAuthorized.mockReturnValue(false);

    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth', {
      method: 'GET',
    });

    const res = await GET(req);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });

  it('rejects unknown query parameters on GET', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth?view=full', {
      method: 'GET',
    });

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
    expect(mocks.mockIsAdminAuthorized).not.toHaveBeenCalled();
  });

  it('rejects empty query keys on GET', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth?=1', {
      method: 'GET',
    });

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
    expect(mocks.mockIsAdminAuthorized).not.toHaveBeenCalled();
  });

  it('sets admin cookie on valid secret', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: 'test-secret' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const setCookieHeader = res.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toContain(ADMIN_SESSION_COOKIE_NAME);
    expect(setCookieHeader).toContain('cookie-value');
    expect(setCookieHeader).toContain('fastlaneAdminCsrf=csrf-token-value');
    expect(setCookieHeader.toLowerCase()).toContain('samesite=strict');
  });

  it('sets admin csrf cookie on authenticated GET with session cookie', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth', {
      method: 'GET',
      headers: { cookie: `${ADMIN_SESSION_COOKIE_NAME}=cookie-value` },
    });

    const res = await GET(req);
    const setCookieHeader = res.headers.get('set-cookie') ?? '';
    expect(res.status).toBe(200);
    expect(setCookieHeader).toContain('fastlaneAdminCsrf=csrf-token-value');
  });

  it('rejects unknown query parameters on POST', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth?source=web', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: 'test-secret' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects invalid secret', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: 'wrong' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects missing secret', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects unknown fields in payload', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: 'test-secret', role: 'admin' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Unknown field/i);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects malformed json payload', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Invalid JSON body/i);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects malformed content-length on POST', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': 'abc',
      },
      body: JSON.stringify({ secret: 'test-secret' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-length header/i);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects oversized content-length on POST', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '2049',
      },
      body: '{}',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects oversized request body on POST', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(3000),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects non-json content-type on POST', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ secret: 'test-secret' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-type header/i);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('accepts json content-type with charset on POST', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ secret: 'test-secret' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain(ADMIN_SESSION_COOKIE_NAME);
  });

  it('rejects non-object json payload', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([]),
    });

    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Invalid JSON body/i);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('clears cookie on delete', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth', {
      method: 'DELETE',
    });

    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const setCookieHeader = res.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toContain(ADMIN_SESSION_COOKIE_NAME);
    expect(setCookieHeader).toContain('Max-Age=0');
    expect(setCookieHeader).toContain('fastlaneAdminCsrf=');
    expect(setCookieHeader.toLowerCase()).toContain('samesite=strict');
  });

  it('rejects unknown query parameters on DELETE', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth?scope=all', {
      method: 'DELETE',
    });

    const res = await DELETE(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('returns 500 when admin session creation fails unexpectedly', async () => {
    mocks.mockCreateAdminSessionCookieValue.mockImplementationOnce(() => {
      throw new Error('missing session secret');
    });

    const req = new NextRequest('http://localhost:3000/api/admin/fastlane/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: 'test-secret' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/Unable to create admin session/i);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
