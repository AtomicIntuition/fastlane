import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockIsValidAdminSecret = vi.fn();
  const mockCleanupExpiredLoginReplayMarkers = vi.fn();
  const mockCleanupStaleLoginRequestThrottleRows = vi.fn();
  return {
    mockIsValidAdminSecret,
    mockCleanupExpiredLoginReplayMarkers,
    mockCleanupStaleLoginRequestThrottleRows,
  };
});

vi.mock('@/lib/utils/admin-session-cookie', () => ({
  isValidAdminSecret: mocks.mockIsValidAdminSecret,
}));

vi.mock('@/lib/fastlane/login-token-replay-maintenance', () => ({
  cleanupExpiredLoginReplayMarkers: mocks.mockCleanupExpiredLoginReplayMarkers,
}));

vi.mock('@/lib/fastlane/login-request-throttle-maintenance', () => ({
  cleanupStaleLoginRequestThrottleRows: mocks.mockCleanupStaleLoginRequestThrottleRows,
}));

import { POST } from '@/app/api/fastlane/maintenance/run/route';

describe('cron maintenance run route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockIsValidAdminSecret.mockReturnValue(true);
    mocks.mockCleanupExpiredLoginReplayMarkers.mockResolvedValue({
      ok: true,
      dryRun: true,
      scanned: 5,
      deleted: 0,
    });
    mocks.mockCleanupStaleLoginRequestThrottleRows.mockResolvedValue({
      ok: true,
      dryRun: true,
      scanned: 8,
      deleted: 0,
      retentionDays: 30,
    });
  });

  it('requires bearer auth', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/fastlane/maintenance/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it('rejects invalid throttle retention days', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/fastlane/maintenance/run', {
        method: 'POST',
        headers: {
          authorization: 'Bearer cron-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ throttleRetentionDays: 0 }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid throttleRetentionDays/i);
  });

  it('runs both maintenance jobs and returns summary', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/fastlane/maintenance/run', {
        method: 'POST',
        headers: {
          authorization: 'Bearer cron-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          dryRun: false,
          replayLimit: 700,
          throttleLimit: 500,
          throttleRetentionDays: 45,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(false);
    expect(typeof body.durationMs).toBe('number');
    expect(mocks.mockIsValidAdminSecret).toHaveBeenCalledWith('cron-secret');
    expect(mocks.mockCleanupExpiredLoginReplayMarkers).toHaveBeenCalledWith({
      dryRun: false,
      limit: 700,
    });
    expect(mocks.mockCleanupStaleLoginRequestThrottleRows).toHaveBeenCalledWith({
      dryRun: false,
      limit: 500,
      retentionDays: 45,
    });
    expect(body.maintenance.replay.scanned).toBe(5);
    expect(body.maintenance.throttle.scanned).toBe(8);
  });
});
