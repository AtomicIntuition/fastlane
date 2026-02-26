import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockIsAdminAuthorized = vi.fn();
  const mockReadinessGet = vi.fn();
  const mockKpiGet = vi.fn();

  return {
    mockIsAdminAuthorized,
    mockReadinessGet,
    mockKpiGet,
  };
});

vi.mock('@/lib/utils/admin-session-cookie', () => ({
  isAdminAuthorized: mocks.mockIsAdminAuthorized,
}));

vi.mock('@/app/api/admin/fastlane/readiness/route', () => ({
  GET: mocks.mockReadinessGet,
}));

vi.mock('@/app/api/admin/fastlane/kpi/route', () => ({
  GET: mocks.mockKpiGet,
}));

import { GET } from '@/app/api/admin/fastlane/overview/route';

describe('FastLane admin overview route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockIsAdminAuthorized.mockReturnValue(true);

    mocks.mockReadinessGet.mockResolvedValue(
      NextResponse.json({
        status: 'ready',
        timestamp: '2026-02-25T00:00:00.000Z',
        operations: {
          failedWebhookEvents: 0,
          maintenanceActionSuccessCount: 9,
          maintenanceActionFailureCount: 1,
          lastMaintenanceSuccessAt: '2026-02-25T08:00:00.000Z',
          lastMaintenanceFailureAt: '2026-02-24T21:15:00.000Z',
          maintenanceReplaySuccessCount: 4,
          maintenanceReplayFailureCount: 1,
          maintenanceThrottleSuccessCount: 3,
          maintenanceThrottleFailureCount: 0,
          maintenanceRunSuccessCount: 2,
          maintenanceRunFailureCount: 0,
        },
      }),
    );

    mocks.mockKpiGet.mockResolvedValue(
      NextResponse.json({
        windowDays: 7,
        funnel: { counts: { onboarding_completed: 40, trial_started: 12 } },
        monetization: { paywallToTrialRate: 21.5 },
      }),
    );
  });

  it('returns unauthorized for non-admin requests', async () => {
    mocks.mockIsAdminAuthorized.mockReturnValue(false);
    const response = await GET(new NextRequest('http://localhost:3000/api/admin/fastlane/overview'));
    expect(response.status).toBe(401);
  });

  it('rejects unknown query parameters', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/fastlane/overview?foo=bar'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/unknown query parameter/i);
  });

  it('rejects invalid days', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/fastlane/overview?days=0'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/invalid days/i);
  });

  it('rejects days above max window', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/fastlane/overview?days=91'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/invalid days/i);
  });

  it('returns merged overview payload', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/fastlane/overview?days=7'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.readiness.status).toBe('ready');
    expect(body.readiness.failedWebhookEvents).toBe(0);
    expect(body.readiness.maintenanceActionSuccessCount).toBe(9);
    expect(body.readiness.maintenanceActionFailureCount).toBe(1);
    expect(body.readiness.lastMaintenanceSuccessAt).toBe('2026-02-25T08:00:00.000Z');
    expect(body.readiness.lastMaintenanceFailureAt).toBe('2026-02-24T21:15:00.000Z');
    expect(body.readiness.maintenanceHealth).toBe('healthy');
    expect(body.readiness.maintenanceRouteSummary.replay.failureCount).toBe(1);
    expect(body.readiness.maintenanceRouteSummary.throttle.failureCount).toBe(0);
    expect(body.readiness.maintenanceRouteSummary.run.failureCount).toBe(0);
    expect(body.readiness.maintenanceRouteSummary.worstFailureRoute).toBe('replay');
    expect(body.readiness.lastMaintenanceTelemetryAt).toBe('2026-02-25T08:00:00.000Z');
    expect(body.kpi.windowDays).toBe(7);
    expect(body.kpi.trialStarted).toBe(12);
    expect(body.kpi.onboardingCompleted).toBe(40);
    expect(body.kpi.paywallToTrialRate).toBe(21.5);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.mockReadinessGet).toHaveBeenCalledTimes(1);
    expect(mocks.mockKpiGet).toHaveBeenCalledTimes(1);
  });

  it('propagates readiness upstream failure details', async () => {
    mocks.mockReadinessGet.mockResolvedValueOnce(
      NextResponse.json({ error: 'Readiness dependency timeout' }, { status: 503 }),
    );

    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/fastlane/overview?days=7'),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toMatch(/readiness dependency timeout/i);
  });

  it('propagates KPI upstream failure details', async () => {
    mocks.mockKpiGet.mockResolvedValueOnce(
      NextResponse.json({ error: 'KPI query failed' }, { status: 500 }),
    );

    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/fastlane/overview?days=7'),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/kpi query failed/i);
  });

  it('marks maintenance health warning when failures are newer than successes', async () => {
    mocks.mockReadinessGet.mockResolvedValueOnce(
      NextResponse.json({
        status: 'ready',
        timestamp: '2026-02-25T00:00:00.000Z',
        operations: {
          failedWebhookEvents: 0,
          maintenanceActionSuccessCount: 1,
          maintenanceActionFailureCount: 2,
          lastMaintenanceSuccessAt: '2026-02-24T08:00:00.000Z',
          lastMaintenanceFailureAt: '2026-02-25T09:00:00.000Z',
          maintenanceReplaySuccessCount: 0,
          maintenanceReplayFailureCount: 1,
          maintenanceThrottleSuccessCount: 0,
          maintenanceThrottleFailureCount: 1,
          maintenanceRunSuccessCount: 1,
          maintenanceRunFailureCount: 0,
        },
      }),
    );

    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/fastlane/overview?days=7'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.readiness.maintenanceHealth).toBe('warning');
    expect(body.readiness.maintenanceRouteSummary.worstFailureRoute).toBe('replay');
    expect(body.readiness.lastMaintenanceTelemetryAt).toBe('2026-02-25T09:00:00.000Z');
  });

  it('returns 504 when an upstream dependency times out', async () => {
    const env = process.env as Record<string, string | undefined>;
    const initialTimeout = env.FASTLANE_ADMIN_OVERVIEW_TIMEOUT_MS;
    env.FASTLANE_ADMIN_OVERVIEW_TIMEOUT_MS = '1';

    mocks.mockReadinessGet.mockImplementationOnce(
      () => new Promise<never>(() => undefined),
    );

    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/fastlane/overview?days=7'),
    );
    const body = await response.json();

    expect(response.status).toBe(504);
    expect(body.error).toMatch(/timed out/i);

    env.FASTLANE_ADMIN_OVERVIEW_TIMEOUT_MS = initialTimeout;
  });
});
