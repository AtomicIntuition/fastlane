import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type LimiterResult = { allowed: boolean; remaining: number; resetAt: number };
type LimiterFn = (key: string) => Promise<LimiterResult>;

const mocks = vi.hoisted(() => {
  const fastlaneLimiter = vi.fn<LimiterFn>();
  const authRequestLimiter = vi.fn<LimiterFn>();
  const authVerifyLimiter = vi.fn<LimiterFn>();
  const fastlaneMaintenanceRunLimiter = vi.fn<LimiterFn>();
  const fastlaneThrottleMaintenanceLimiter = vi.fn<LimiterFn>();
  const fastlaneMaintenanceLimiter = vi.fn<LimiterFn>();
  const adminAuthLimiter = vi.fn<LimiterFn>();
  const adminMaintenanceRunLimiter = vi.fn<LimiterFn>();
  const adminThrottleMaintenanceLimiter = vi.fn<LimiterFn>();
  const adminMaintenanceLimiter = vi.fn<LimiterFn>();
  const adminFastlaneLimiter = vi.fn<LimiterFn>();

  const limiterQueue = [
    fastlaneLimiter,
    authRequestLimiter,
    authVerifyLimiter,
    fastlaneMaintenanceLimiter,
    fastlaneThrottleMaintenanceLimiter,
    fastlaneMaintenanceRunLimiter,
    adminAuthLimiter,
    adminMaintenanceLimiter,
    adminThrottleMaintenanceLimiter,
    adminMaintenanceRunLimiter,
    adminFastlaneLimiter,
  ];

  const mockRateLimit = vi.fn(() => {
    const limiter = limiterQueue.shift();
    if (!limiter) {
      throw new Error('No limiter mock available');
    }
    return limiter;
  });

  return {
    fastlaneLimiter,
    authRequestLimiter,
    authVerifyLimiter,
    fastlaneMaintenanceRunLimiter,
    fastlaneThrottleMaintenanceLimiter,
    fastlaneMaintenanceLimiter,
    adminAuthLimiter,
    adminMaintenanceRunLimiter,
    adminThrottleMaintenanceLimiter,
    adminMaintenanceLimiter,
    adminFastlaneLimiter,
    mockRateLimit,
  };
});

vi.mock('@/lib/utils/rate-limit', () => ({
  rateLimit: mocks.mockRateLimit,
}));

import { proxy } from '@/proxy';

describe('proxy rate limiter routing', () => {
  const now = Date.now() + 60_000;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fastlaneLimiter.mockResolvedValue({ allowed: true, remaining: 59, resetAt: now });
    mocks.authRequestLimiter.mockResolvedValue({ allowed: true, remaining: 7, resetAt: now });
    mocks.authVerifyLimiter.mockResolvedValue({ allowed: true, remaining: 19, resetAt: now });
    mocks.fastlaneMaintenanceRunLimiter.mockResolvedValue({ allowed: false, remaining: 0, resetAt: now });
    mocks.fastlaneThrottleMaintenanceLimiter.mockResolvedValue({ allowed: false, remaining: 0, resetAt: now });
    mocks.fastlaneMaintenanceLimiter.mockResolvedValue({ allowed: false, remaining: 0, resetAt: now });
    mocks.adminAuthLimiter.mockResolvedValue({ allowed: true, remaining: 9, resetAt: now });
    mocks.adminMaintenanceRunLimiter.mockResolvedValue({ allowed: false, remaining: 0, resetAt: now });
    mocks.adminThrottleMaintenanceLimiter.mockResolvedValue({ allowed: false, remaining: 0, resetAt: now });
    mocks.adminMaintenanceLimiter.mockResolvedValue({ allowed: false, remaining: 0, resetAt: now });
    mocks.adminFastlaneLimiter.mockResolvedValue({ allowed: true, remaining: 29, resetAt: now });
  });

  it('applies fastlane throttle-maintenance limiter before generic fastlane limiter', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/fastlane/maintenance/auth-request-throttle',
      {
        headers: { 'x-real-ip': '10.0.0.2' },
      },
    );
    const response = await proxy(request);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toMatch(/Too many requests/i);
    expect(mocks.fastlaneThrottleMaintenanceLimiter).toHaveBeenCalledWith('10.0.0.2');
    expect(mocks.fastlaneLimiter).not.toHaveBeenCalled();
  });

  it('applies fastlane maintenance-run limiter before generic fastlane limiter', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/maintenance/run', {
      headers: { 'x-real-ip': '10.0.0.3' },
    });
    const response = await proxy(request);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toMatch(/Too many requests/i);
    expect(mocks.fastlaneMaintenanceRunLimiter).toHaveBeenCalledWith('10.0.0.3');
    expect(mocks.fastlaneLimiter).not.toHaveBeenCalled();
  });

  it('applies fastlane maintenance limiter before generic fastlane limiter', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/maintenance/auth-replay', {
      headers: { 'x-real-ip': '10.0.0.1' },
    });
    const response = await proxy(request);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toMatch(/Too many requests/i);
    expect(mocks.fastlaneMaintenanceLimiter).toHaveBeenCalledWith('10.0.0.1');
    expect(mocks.fastlaneLimiter).not.toHaveBeenCalled();
  });

  it('applies admin maintenance limiter before generic admin limiter', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/fastlane/maintenance/auth-replay',
      {
        headers: { 'x-forwarded-for': '203.0.113.8, 198.51.100.4' },
      },
    );
    const response = await proxy(request);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toMatch(/Too many requests/i);
    expect(mocks.adminMaintenanceLimiter).toHaveBeenCalledWith('203.0.113.8');
    expect(mocks.adminFastlaneLimiter).not.toHaveBeenCalled();
  });

  it('applies admin maintenance-run limiter before generic admin limiter', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/fastlane/maintenance/run',
      {
        headers: { 'x-forwarded-for': '203.0.113.11, 198.51.100.4' },
      },
    );
    const response = await proxy(request);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toMatch(/Too many requests/i);
    expect(mocks.adminMaintenanceRunLimiter).toHaveBeenCalledWith('203.0.113.11');
    expect(mocks.adminFastlaneLimiter).not.toHaveBeenCalled();
  });

  it('applies admin throttle-maintenance limiter before generic admin limiter', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/fastlane/maintenance/auth-request-throttle',
      {
        headers: { 'x-forwarded-for': '203.0.113.9, 198.51.100.4' },
      },
    );
    const response = await proxy(request);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toMatch(/Too many requests/i);
    expect(mocks.adminThrottleMaintenanceLimiter).toHaveBeenCalledWith('203.0.113.9');
    expect(mocks.adminFastlaneLimiter).not.toHaveBeenCalled();
  });
});
