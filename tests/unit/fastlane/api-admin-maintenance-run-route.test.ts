import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockIsAdminAuthorized = vi.fn();
  const mockHasValidAdminCsrfRequest = vi.fn();
  const mockCleanupExpiredLoginReplayMarkers = vi.fn();
  const mockCleanupStaleLoginRequestThrottleRows = vi.fn();
  const mockRecordMaintenanceTelemetryEvent = vi.fn();
  return {
    mockIsAdminAuthorized,
    mockHasValidAdminCsrfRequest,
    mockCleanupExpiredLoginReplayMarkers,
    mockCleanupStaleLoginRequestThrottleRows,
    mockRecordMaintenanceTelemetryEvent,
  };
});

vi.mock('@/lib/utils/admin-session-cookie', () => ({
  isAdminAuthorized: mocks.mockIsAdminAuthorized,
}));

vi.mock('@/lib/utils/admin-csrf', () => ({
  hasValidAdminCsrfRequest: mocks.mockHasValidAdminCsrfRequest,
}));

vi.mock('@/lib/fastlane/login-token-replay-maintenance', () => ({
  cleanupExpiredLoginReplayMarkers: mocks.mockCleanupExpiredLoginReplayMarkers,
}));

vi.mock('@/lib/fastlane/login-request-throttle-maintenance', () => ({
  cleanupStaleLoginRequestThrottleRows: mocks.mockCleanupStaleLoginRequestThrottleRows,
}));

vi.mock('@/lib/fastlane/maintenance-ops-telemetry', () => ({
  recordMaintenanceTelemetryEvent: mocks.mockRecordMaintenanceTelemetryEvent,
}));

import { POST } from '@/app/api/admin/fastlane/maintenance/run/route';

describe('admin maintenance run route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockIsAdminAuthorized.mockReturnValue(true);
    mocks.mockHasValidAdminCsrfRequest.mockReturnValue(true);
    mocks.mockCleanupExpiredLoginReplayMarkers.mockResolvedValue({
      ok: true,
      dryRun: false,
      scanned: 5,
      deleted: 2,
    });
    mocks.mockCleanupStaleLoginRequestThrottleRows.mockResolvedValue({
      ok: true,
      dryRun: false,
      scanned: 8,
      deleted: 3,
      retentionDays: 30,
    });
  });

  it('returns unauthorized when admin auth fails', async () => {
    mocks.mockIsAdminAuthorized.mockReturnValue(false);
    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/fastlane/maintenance/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it('rejects requests when csrf validation fails', async () => {
    mocks.mockHasValidAdminCsrfRequest.mockReturnValueOnce(false);
    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/fastlane/maintenance/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/CSRF validation failed/i);
  });

  it('rejects invalid throttleRetentionDays', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/fastlane/maintenance/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ throttleRetentionDays: 0 }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid throttleRetentionDays/i);
    expect(mocks.mockCleanupExpiredLoginReplayMarkers).not.toHaveBeenCalled();
    expect(mocks.mockCleanupStaleLoginRequestThrottleRows).not.toHaveBeenCalled();
  });

  it('runs both maintenance jobs and returns summary', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/fastlane/maintenance/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
          replayLimit: 400,
          throttleLimit: 200,
          throttleRetentionDays: 45,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(body.maintenance.replay.scanned).toBe(5);
    expect(body.maintenance.throttle.scanned).toBe(8);
    expect(mocks.mockCleanupExpiredLoginReplayMarkers).toHaveBeenCalledWith({
      dryRun: true,
      limit: 400,
    });
    expect(mocks.mockCleanupStaleLoginRequestThrottleRows).toHaveBeenCalledWith({
      dryRun: true,
      limit: 200,
      retentionDays: 45,
    });
    expect(mocks.mockRecordMaintenanceTelemetryEvent).toHaveBeenCalledWith(
      'admin_maintenance_run_success',
      expect.objectContaining({
        dryRun: true,
        replayScanned: 5,
        replayDeleted: 2,
        throttleScanned: 8,
        throttleDeleted: 3,
      }),
    );
  });

  it('records failure telemetry when cleanup throws', async () => {
    mocks.mockCleanupExpiredLoginReplayMarkers.mockRejectedValueOnce(new Error('boom'));
    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/fastlane/maintenance/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Unable to run maintenance/i);
    expect(mocks.mockRecordMaintenanceTelemetryEvent).toHaveBeenCalledWith(
      'admin_maintenance_run_failure',
    );
  });
});
