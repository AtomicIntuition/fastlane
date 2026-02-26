import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAdminSessionCookieValue,
  isAdminAuthorized,
  isValidAdminSecret,
  verifyAdminSessionCookieValue,
  ADMIN_SESSION_COOKIE_NAME,
} from '@/lib/utils/admin-session-cookie';

describe('admin session cookie utils', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialAdminSessionSecret = env.ADMIN_SESSION_SECRET;
  const initialCronSecret = env.CRON_SECRET;

  beforeEach(() => {
    process.env.ADMIN_SESSION_SECRET = 'admin-secret-test';
    process.env.CRON_SECRET = 'cron-secret-test';
  });

  afterEach(() => {
    env.ADMIN_SESSION_SECRET = initialAdminSessionSecret;
    env.CRON_SECRET = initialCronSecret;
  });

  it('creates and verifies a valid cookie', () => {
    const now = 1_700_000_000_000;
    const value = createAdminSessionCookieValue(now);
    expect(verifyAdminSessionCookieValue(value, now + 1000)).toBe(true);
  });

  it('rejects tampered cookie', () => {
    const value = createAdminSessionCookieValue(1_700_000_000_000);
    const tampered = `${value}x`;
    expect(verifyAdminSessionCookieValue(tampered, 1_700_000_000_500)).toBe(false);
  });

  it('rejects malformed cookie format', () => {
    const malformed = '1700000000000.sig.extra';
    expect(verifyAdminSessionCookieValue(malformed, 1_700_000_000_500)).toBe(false);
  });

  it('rejects cookie with non-hex signature segment', () => {
    const malformed = '1700000000000.nothexsignature!!!!!!!!';
    expect(verifyAdminSessionCookieValue(malformed, 1_700_000_000_500)).toBe(false);
  });

  it('rejects oversized admin session cookie value', () => {
    const oversized = `${'9'.repeat(233)}.${'a'.repeat(24)}`;
    expect(verifyAdminSessionCookieValue(oversized, 1_700_000_000_500)).toBe(false);
  });

  it('authorizes via bearer header fallback', () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });

    expect(isAdminAuthorized(request)).toBe(true);
  });

  it('authorizes via session cookie', () => {
    const cookieValue = createAdminSessionCookieValue();
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE_NAME}=${cookieValue}`,
      },
    });

    expect(isAdminAuthorized(request)).toBe(true);
  });

  it('rejects unauthorized request', () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess');
    expect(isAdminAuthorized(request)).toBe(false);
  });

  it('rejects incorrect bearer header', () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      headers: { authorization: 'Bearer wrong-secret' },
    });

    expect(isAdminAuthorized(request)).toBe(false);
  });

  it('rejects oversized bearer header input', () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      headers: { authorization: `Bearer ${'x'.repeat(600)}` },
    });

    expect(isAdminAuthorized(request)).toBe(false);
  });

  it('validates admin secret with constant-time helper', () => {
    expect(isValidAdminSecret('cron-secret-test')).toBe(true);
    expect(isValidAdminSecret('wrong')).toBe(false);
    expect(isValidAdminSecret(undefined)).toBe(false);
  });

  it('rejects oversized admin secret input', () => {
    expect(isValidAdminSecret('x'.repeat(257))).toBe(false);
  });

  it('fails closed when verifying cookie without configured secrets', () => {
    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.CRON_SECRET;

    const futureCookie = '4102444800000.deadbeefdeadbeefdeadbeef';
    expect(verifyAdminSessionCookieValue(futureCookie, 1_700_000_000_000)).toBe(false);
  });

  it('fails closed for cookie auth when configured secrets are missing', () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE_NAME}=4102444800000.deadbeefdeadbeefdeadbeef`,
      },
    });

    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.CRON_SECRET;

    expect(isAdminAuthorized(request)).toBe(false);
  });
});
