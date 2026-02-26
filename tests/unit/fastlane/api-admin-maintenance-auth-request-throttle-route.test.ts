import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockIsAdminAuthorized = vi.fn();
  const mockHasValidAdminCsrfRequest = vi.fn();
  const mockParseThrottleCleanupLimit = vi.fn();
  const mockParseThrottleRetentionDays = vi.fn();
  const mockCleanupStaleLoginRequestThrottleRows = vi.fn();
  const mockRecordMaintenanceTelemetryEvent = vi.fn();
  return {
    mockIsAdminAuthorized,
    mockHasValidAdminCsrfRequest,
    mockParseThrottleCleanupLimit,
    mockParseThrottleRetentionDays,
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

vi.mock('@/lib/fastlane/login-request-throttle-maintenance', () => ({
  parseThrottleCleanupLimit: mocks.mockParseThrottleCleanupLimit,
  parseThrottleRetentionDays: mocks.mockParseThrottleRetentionDays,
  cleanupStaleLoginRequestThrottleRows: mocks.mockCleanupStaleLoginRequestThrottleRows,
}));

vi.mock('@/lib/fastlane/maintenance-ops-telemetry', () => ({
  recordMaintenanceTelemetryEvent: mocks.mockRecordMaintenanceTelemetryEvent,
}));

import { POST } from '@/app/api/admin/fastlane/maintenance/auth-request-throttle/route';

describe('admin auth request throttle maintenance route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockIsAdminAuthorized.mockReturnValue(true);
    mocks.mockHasValidAdminCsrfRequest.mockReturnValue(true);
    mocks.mockParseThrottleCleanupLimit.mockReturnValue(1000);
    mocks.mockParseThrottleRetentionDays.mockReturnValue(30);
    mocks.mockCleanupStaleLoginRequestThrottleRows.mockResolvedValue({
      ok: true,
      dryRun: true,
      scanned: 0,
      deleted: 0,
      retentionDays: 30,
    });
  });

  it('returns unauthorized when admin auth fails', async () => {
    mocks.mockIsAdminAuthorized.mockReturnValue(false);
    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/fastlane/maintenance/auth-request-throttle', {
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
      new NextRequest('http://localhost:3000/api/admin/fastlane/maintenance/auth-request-throttle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/CSRF validation failed/i);
  });

  it('rejects invalid retentionDays', async () => {
    mocks.mockParseThrottleRetentionDays.mockReturnValueOnce(null);
    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/fastlane/maintenance/auth-request-throttle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ retentionDays: 0 }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid retentionDays/i);
    expect(mocks.mockCleanupStaleLoginRequestThrottleRows).not.toHaveBeenCalled();
  });

  it('runs cleanup with parsed values', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/fastlane/maintenance/auth-request-throttle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: false, limit: 250, retentionDays: 45 }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.mockParseThrottleCleanupLimit).toHaveBeenCalledWith(250, 1000);
    expect(mocks.mockParseThrottleRetentionDays).toHaveBeenCalledWith(45, 30);
    expect(mocks.mockCleanupStaleLoginRequestThrottleRows).toHaveBeenCalledWith({
      dryRun: false,
      limit: 1000,
      retentionDays: 30,
    });
    expect(mocks.mockRecordMaintenanceTelemetryEvent).toHaveBeenCalledWith(
      'admin_maintenance_throttle_success',
      expect.objectContaining({ dryRun: false, scanned: 0, deleted: 0 }),
    );
  });
});
