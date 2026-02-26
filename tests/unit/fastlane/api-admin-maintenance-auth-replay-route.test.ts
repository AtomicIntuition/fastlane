import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockIsAdminAuthorized = vi.fn();
  const mockHasValidAdminCsrfRequest = vi.fn();

  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

  const mockDeleteReturning = vi.fn();
  const mockDeleteWhere = vi.fn(() => ({ returning: mockDeleteReturning }));
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));
  const mockRecordMaintenanceTelemetryEvent = vi.fn();

  return {
    mockIsAdminAuthorized,
    mockHasValidAdminCsrfRequest,
    mockSelect,
    mockSelectFrom,
    mockSelectWhere,
    mockSelectLimit,
    mockDelete,
    mockDeleteWhere,
    mockDeleteReturning,
    mockRecordMaintenanceTelemetryEvent,
  };
});

vi.mock('@/lib/utils/admin-session-cookie', () => ({
  isAdminAuthorized: mocks.mockIsAdminAuthorized,
}));

vi.mock('@/lib/utils/admin-csrf', () => ({
  hasValidAdminCsrfRequest: mocks.mockHasValidAdminCsrfRequest,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.mockSelect,
    delete: mocks.mockDelete,
  },
}));

vi.mock('@/lib/fastlane/maintenance-ops-telemetry', () => ({
  recordMaintenanceTelemetryEvent: mocks.mockRecordMaintenanceTelemetryEvent,
}));

import { POST } from '@/app/api/admin/fastlane/maintenance/auth-replay/route';

describe('admin auth replay maintenance route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockIsAdminAuthorized.mockReturnValue(true);
    mocks.mockHasValidAdminCsrfRequest.mockReturnValue(true);
    mocks.mockSelectLimit.mockResolvedValue([]);
    mocks.mockDeleteReturning.mockResolvedValue([]);
  });

  it('returns unauthorized when admin auth fails', async () => {
    mocks.mockIsAdminAuthorized.mockReturnValue(false);
    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/fastlane/maintenance/auth-replay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it('supports dry-run cleanup', async () => {
    mocks.mockSelectLimit.mockResolvedValue([{ id: 'row_1' }, { id: 'row_2' }]);

    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/fastlane/maintenance/auth-replay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: true, limit: 100 }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(body.scanned).toBe(2);
    expect(body.deleted).toBe(0);
    expect(mocks.mockDelete).not.toHaveBeenCalled();
    expect(mocks.mockRecordMaintenanceTelemetryEvent).toHaveBeenCalledWith(
      'admin_maintenance_replay_success',
      expect.objectContaining({ dryRun: true, scanned: 2, deleted: 0 }),
    );
  });

  it('rejects requests when csrf validation fails', async () => {
    mocks.mockHasValidAdminCsrfRequest.mockReturnValueOnce(false);

    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/fastlane/maintenance/auth-replay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/CSRF validation failed/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
  });

  it('deletes expired markers when dryRun is false', async () => {
    mocks.mockSelectLimit.mockResolvedValue([{ id: 'row_1' }, { id: 'row_2' }, { id: 'row_3' }]);
    mocks.mockDeleteReturning.mockResolvedValue([{ id: 'row_1' }, { id: 'row_2' }]);

    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/fastlane/maintenance/auth-replay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: false, limit: 100 }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(false);
    expect(body.scanned).toBe(3);
    expect(body.deleted).toBe(2);
    expect(mocks.mockDelete).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid limit values', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/fastlane/maintenance/auth-replay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 10001 }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid limit/i);
  });
});
