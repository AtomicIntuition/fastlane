import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveFastLaneAppUrl } from '@/lib/fastlane/app-url';

describe('fastlane app url resolver', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialNodeEnv = env.NODE_ENV;
  const initialAppUrl = env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    env.NODE_ENV = initialNodeEnv;
    env.NEXT_PUBLIC_APP_URL = initialAppUrl;
  });

  it('returns normalized configured https app url', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com///';
    const request = new NextRequest('http://localhost:3000/fastlane/app');
    expect(resolveFastLaneAppUrl(request)).toBe('https://example.com');
  });

  it('rejects configured non-http(s) app url schemes', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'ftp://example.com';
    const request = new NextRequest('http://localhost:3000/fastlane/app');
    expect(resolveFastLaneAppUrl(request)).toBeNull();
  });

  it('rejects configured app url with embedded credentials', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://user:pass@example.com';
    const request = new NextRequest('http://localhost:3000/fastlane/app');
    expect(resolveFastLaneAppUrl(request)).toBeNull();
  });

  it('returns null in production when configured app url is missing', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    env.NODE_ENV = 'production';
    const request = new NextRequest('http://localhost:3000/fastlane/app');
    expect(resolveFastLaneAppUrl(request)).toBeNull();
  });

  it('falls back to normalized request origin in non-production when app url is missing', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    env.NODE_ENV = 'development';
    const request = new NextRequest('http://localhost:3000/fastlane/app');
    expect(resolveFastLaneAppUrl(request)).toBe('http://localhost:3000');
  });

  it('rejects non-http(s) request origin in non-production fallback mode', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    env.NODE_ENV = 'development';
    const request = {
      nextUrl: { origin: 'chrome-extension://abc123' },
    } as unknown as NextRequest;
    expect(resolveFastLaneAppUrl(request)).toBeNull();
  });

  it('rejects credentialed request origin in non-production fallback mode', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    env.NODE_ENV = 'development';
    const request = {
      nextUrl: { origin: 'https://user:pass@example.com' },
    } as unknown as NextRequest;
    expect(resolveFastLaneAppUrl(request)).toBeNull();
  });
});
