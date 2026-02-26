import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockIsAdminAuthorized = vi.fn();
  const mockLimit = vi.fn<(...args: unknown[]) => Promise<Array<{ count: number; ageMinutes?: number }>>>(
    async () => [{ count: 0 }],
  );
  const mockWhere = vi.fn(() => ({ limit: mockLimit }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  const mockGetServiceReadiness = vi.fn(() => ({
    databaseConfigured: true,
    authConfigured: true,
    authEmailConfigured: true,
    billingConfigured: true,
    monitoring: {
      sentryServerDsnConfigured: true,
      sentryClientDsnConfigured: true,
      alertsRoutingConfigured: true,
      readyForProduction: true,
    },
    readyForProduction: true,
  }));
  const mockGetMaintenanceOpsTelemetrySnapshot = vi.fn(async () => ({
    maintenanceActionSuccessCount: 0,
    maintenanceActionFailureCount: 0,
    lastMaintenanceSuccessAt: null,
    lastMaintenanceFailureAt: null,
    byRoute: {
      replay: { successCount: 0, failureCount: 0, lastEventAt: null },
      throttle: { successCount: 0, failureCount: 0, lastEventAt: null },
      run: { successCount: 0, failureCount: 0, lastEventAt: null },
    },
  }));

  return {
    mockIsAdminAuthorized,
    mockSelect,
    mockFrom,
    mockWhere,
    mockLimit,
    mockGetServiceReadiness,
    mockGetMaintenanceOpsTelemetrySnapshot,
  };
});

vi.mock('@/lib/utils/admin-session-cookie', () => ({
  isAdminAuthorized: mocks.mockIsAdminAuthorized,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.mockSelect,
  },
}));

vi.mock('@/lib/utils/service-readiness', () => ({
  getServiceReadiness: mocks.mockGetServiceReadiness,
}));

vi.mock('@/lib/fastlane/maintenance-ops-telemetry', () => ({
  getMaintenanceOpsTelemetrySnapshot: mocks.mockGetMaintenanceOpsTelemetrySnapshot,
}));

import { GET } from '@/app/api/admin/fastlane/readiness/route';

describe('admin readiness route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockIsAdminAuthorized.mockReturnValue(true);
    mocks.mockLimit.mockResolvedValue([{ count: 0 }]);
  });

  it('returns unauthorized when admin auth fails', async () => {
    mocks.mockIsAdminAuthorized.mockReturnValue(false);

    const response = await GET(new NextRequest('http://localhost:3000/api/admin/fastlane/readiness'));
    expect(response.status).toBe(401);
  });

  it('rejects unknown query parameters', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/fastlane/readiness?foo=bar'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
  });

  it('returns ready when readiness is true and failed webhooks are zero', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/admin/fastlane/readiness'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(body.status).toMatch(/ready|staging/i);
    expect(body.operations.failedWebhookEvents).toBe(0);
    expect(body.operations.linkedAccounts).toBe(0);
    expect(body.operations.activeLoginReplayMarkers).toBe(0);
    expect(body.operations.expiredLoginReplayMarkers).toBe(0);
    expect(body.operations.billingAtRiskSubscriptions).toBe(0);
    expect(body.operations.scheduledCancellations).toBe(0);
    expect(body.operations.oldestFailedWebhookAgeMinutes).toBe(0);
    expect(body.operations.authThrottleActiveRows).toBe(0);
    expect(body.operations.authThrottleStaleRows).toBe(0);
    expect(body.operations.maintenanceActionSuccessCount).toBe(0);
    expect(body.operations.maintenanceActionFailureCount).toBe(0);
    expect(body.operations.lastMaintenanceSuccessAt).toBeNull();
    expect(body.operations.lastMaintenanceFailureAt).toBeNull();
    expect(body.operations.maintenanceReplaySuccessCount).toBe(0);
    expect(body.operations.maintenanceReplayFailureCount).toBe(0);
    expect(body.operations.maintenanceReplayLastEventAt).toBeNull();
    expect(body.operations.maintenanceThrottleSuccessCount).toBe(0);
    expect(body.operations.maintenanceThrottleFailureCount).toBe(0);
    expect(body.operations.maintenanceThrottleLastEventAt).toBeNull();
    expect(body.operations.maintenanceRunSuccessCount).toBe(0);
    expect(body.operations.maintenanceRunFailureCount).toBe(0);
    expect(body.operations.maintenanceRunLastEventAt).toBeNull();
  });

  it('returns degraded in production when failed webhook events exist', async () => {
    const env = process.env as Record<string, string | undefined>;
    const initialNodeEnv = env.NODE_ENV;

    env.NODE_ENV = 'production';
    mocks.mockLimit
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 5 }])
      .mockResolvedValueOnce([{ count: 0, ageMinutes: 44 }])
      .mockResolvedValueOnce([{ count: 11 }])
      .mockResolvedValueOnce([{ count: 4 }]);

    const response = await GET(new NextRequest('http://localhost:3000/api/admin/fastlane/readiness'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.operations.failedWebhookEvents).toBe(3);
    expect(body.operations.billingAtRiskSubscriptions).toBe(2);
    expect(body.operations.scheduledCancellations).toBe(5);
    expect(body.operations.oldestFailedWebhookAgeMinutes).toBe(44);
    expect(body.operations.authThrottleActiveRows).toBe(11);
    expect(body.operations.authThrottleStaleRows).toBe(4);
    expect(body.operations.maintenanceActionSuccessCount).toBe(0);
    expect(body.operations.maintenanceActionFailureCount).toBe(0);

    env.NODE_ENV = initialNodeEnv;
  });
});
