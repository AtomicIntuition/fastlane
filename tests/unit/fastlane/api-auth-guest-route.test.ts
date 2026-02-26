import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DELETE, POST } from '@/app/api/fastlane/auth/guest/route';
import { COOKIE_NAME, generateSignedUserId, getUserIdFromSignedCookieValue } from '@/lib/utils/signed-cookie';
import { FASTLANE_CSRF_COOKIE_NAME } from '@/lib/utils/fastlane-csrf';
import { FASTLANE_ACCOUNT_SESSION_COOKIE_NAME } from '@/lib/utils/fastlane-account-session-cookie';

describe('FastLane guest auth route', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialUserCookieSecret = env.USER_COOKIE_SECRET;
  const initialCronSecret = env.CRON_SECRET;

  beforeEach(() => {
    process.env.USER_COOKIE_SECRET = 'test-user-cookie-secret';
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  afterEach(() => {
    env.USER_COOKIE_SECRET = initialUserCookieSecret;
    env.CRON_SECRET = initialCronSecret;
  });

  it('creates and sets a signed cookie when none exists', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/guest', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(typeof body.userId).toBe('string');
    expect(body.userId.length).toBeGreaterThan(0);
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
    expect(setCookie).toContain(`${FASTLANE_CSRF_COOKIE_NAME}=`);
  });

  it('rejects unknown query parameters', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/guest?source=web', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('rejects malformed json payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/guest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid JSON body/i);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('rejects malformed content-length header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/guest', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': 'abc',
      },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-length header/i);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('rejects oversized content-length header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/guest', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '2049',
      },
      body: '{}',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('rejects oversized request body', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/guest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(3000),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('rejects non-json content-type when body is provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/guest', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-type header/i);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('accepts json content-type with charset when body is provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/guest', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.userId).toBe('string');
  });

  it('rejects unknown fields in payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/guest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'web' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown field/i);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('reuses existing valid signed cookie identity without rotating it', async () => {
    const signed = generateSignedUserId();
    const expectedUserId = getUserIdFromSignedCookieValue(signed);

    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/guest', {
      method: 'POST',
      headers: { cookie: `${COOKIE_NAME}=${signed}` },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.userId).toBe(expectedUserId);
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${FASTLANE_CSRF_COOKIE_NAME}=`);
    expect(setCookie).not.toContain(`${COOKIE_NAME}=`);
  });

  it('replaces invalid signed cookie with a fresh signed identity', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/guest', {
      method: 'POST',
      headers: { cookie: `${COOKIE_NAME}=tampered.value` },
    });

    const response = await POST(request);
    const body = await response.json();
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(typeof body.userId).toBe('string');
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
  });

  it('returns 500 when signing secret configuration is missing', async () => {
    delete process.env.USER_COOKIE_SECRET;
    delete process.env.CRON_SECRET;

    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/guest', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Unable to create guest session/i);
  });

  it('clears guest session cookie on delete', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/guest', {
      method: 'DELETE',
    });

    const response = await DELETE(request);
    const body = await response.json();
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
    expect(setCookie).toContain(`${FASTLANE_CSRF_COOKIE_NAME}=`);
    expect(setCookie).toContain(`${FASTLANE_ACCOUNT_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('Max-Age=0');
  });

  it('rejects delete requests with a body', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/auth/guest', {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ clearAll: true }),
    });

    const response = await DELETE(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Request body not allowed/i);
  });
});
