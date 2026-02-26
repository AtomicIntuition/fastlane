import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockIsValidAdminSecret = vi.fn();
  const mockParseReplayCleanupLimit = vi.fn();
  const mockCleanupExpiredLoginReplayMarkers = vi.fn();
  return {
    mockIsValidAdminSecret,
    mockParseReplayCleanupLimit,
    mockCleanupExpiredLoginReplayMarkers,
  };
});

vi.mock('@/lib/utils/admin-session-cookie', () => ({
  isValidAdminSecret: mocks.mockIsValidAdminSecret,
}));

vi.mock('@/lib/fastlane/login-token-replay-maintenance', () => ({
  parseReplayCleanupLimit: mocks.mockParseReplayCleanupLimit,
  cleanupExpiredLoginReplayMarkers: mocks.mockCleanupExpiredLoginReplayMarkers,
}));

import { POST } from '@/app/api/fastlane/maintenance/auth-replay/route';

describe('cron auth replay maintenance route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockIsValidAdminSecret.mockReturnValue(true);
    mocks.mockParseReplayCleanupLimit.mockReturnValue(1000);
    mocks.mockCleanupExpiredLoginReplayMarkers.mockResolvedValue({
      ok: true,
      dryRun: true,
      scanned: 12,
      deleted: 0,
    });
  });

  it('requires bearer cron auth', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/fastlane/maintenance/auth-replay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it('rejects invalid limit', async () => {
    mocks.mockParseReplayCleanupLimit.mockReturnValueOnce(null);
    const response = await POST(
      new NextRequest('http://localhost:3000/api/fastlane/maintenance/auth-replay', {
        method: 'POST',
        headers: {
          authorization: 'Bearer cron-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ limit: 10001 }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid limit/i);
    expect(mocks.mockCleanupExpiredLoginReplayMarkers).not.toHaveBeenCalled();
  });

  it('runs cleanup with parsed args', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/fastlane/maintenance/auth-replay', {
        method: 'POST',
        headers: {
          authorization: 'Bearer cron-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ dryRun: false, limit: 250 }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.mockIsValidAdminSecret).toHaveBeenCalledWith('cron-secret');
    expect(mocks.mockParseReplayCleanupLimit).toHaveBeenCalledWith(250, 1000);
    expect(mocks.mockCleanupExpiredLoginReplayMarkers).toHaveBeenCalledWith({
      dryRun: false,
      limit: 1000,
    });
  });
});
