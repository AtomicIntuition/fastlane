import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockIsValidAdminSecret = vi.fn();
  const mockParseThrottleCleanupLimit = vi.fn();
  const mockParseThrottleRetentionDays = vi.fn();
  const mockCleanupStaleLoginRequestThrottleRows = vi.fn();
  return {
    mockIsValidAdminSecret,
    mockParseThrottleCleanupLimit,
    mockParseThrottleRetentionDays,
    mockCleanupStaleLoginRequestThrottleRows,
  };
});

vi.mock('@/lib/utils/admin-session-cookie', () => ({
  isValidAdminSecret: mocks.mockIsValidAdminSecret,
}));

vi.mock('@/lib/fastlane/login-request-throttle-maintenance', () => ({
  parseThrottleCleanupLimit: mocks.mockParseThrottleCleanupLimit,
  parseThrottleRetentionDays: mocks.mockParseThrottleRetentionDays,
  cleanupStaleLoginRequestThrottleRows: mocks.mockCleanupStaleLoginRequestThrottleRows,
}));

import { POST } from '@/app/api/fastlane/maintenance/auth-request-throttle/route';

describe('cron auth request throttle maintenance route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockIsValidAdminSecret.mockReturnValue(true);
    mocks.mockParseThrottleCleanupLimit.mockReturnValue(1000);
    mocks.mockParseThrottleRetentionDays.mockReturnValue(30);
    mocks.mockCleanupStaleLoginRequestThrottleRows.mockResolvedValue({
      ok: true,
      dryRun: false,
      scanned: 20,
      deleted: 13,
      retentionDays: 30,
    });
  });

  it('requires bearer cron auth', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/fastlane/maintenance/auth-request-throttle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it('rejects invalid retentionDays', async () => {
    mocks.mockParseThrottleRetentionDays.mockReturnValueOnce(null);
    const response = await POST(
      new NextRequest('http://localhost:3000/api/fastlane/maintenance/auth-request-throttle', {
        method: 'POST',
        headers: {
          authorization: 'Bearer cron-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ retentionDays: 366 }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid retentionDays/i);
    expect(mocks.mockCleanupStaleLoginRequestThrottleRows).not.toHaveBeenCalled();
  });

  it('runs cleanup with parsed values', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/fastlane/maintenance/auth-request-throttle', {
        method: 'POST',
        headers: {
          authorization: 'Bearer cron-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ dryRun: true, limit: 500, retentionDays: 60 }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.mockIsValidAdminSecret).toHaveBeenCalledWith('cron-secret');
    expect(mocks.mockParseThrottleCleanupLimit).toHaveBeenCalledWith(500, 1000);
    expect(mocks.mockParseThrottleRetentionDays).toHaveBeenCalledWith(60, 30);
    expect(mocks.mockCleanupStaleLoginRequestThrottleRows).toHaveBeenCalledWith({
      dryRun: true,
      limit: 1000,
      retentionDays: 30,
    });
  });
});
