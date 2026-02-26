import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

  const mockDeleteReturning = vi.fn();
  const mockDeleteWhere = vi.fn(() => ({ returning: mockDeleteReturning }));
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));

  return {
    mockSelectLimit,
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockDeleteReturning,
    mockDeleteWhere,
    mockDelete,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.mockSelect,
    delete: mocks.mockDelete,
  },
}));

import {
  cleanupStaleLoginRequestThrottleRows,
  parseThrottleCleanupLimit,
  parseThrottleRetentionDays,
} from '@/lib/fastlane/login-request-throttle-maintenance';

describe('login request throttle maintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockSelectLimit.mockResolvedValue([]);
    mocks.mockDeleteReturning.mockResolvedValue([]);
  });

  it('parses cleanup limit bounds', () => {
    expect(parseThrottleCleanupLimit(undefined, 1000)).toBe(1000);
    expect(parseThrottleCleanupLimit(1)).toBe(1);
    expect(parseThrottleCleanupLimit('10000')).toBe(10000);
    expect(parseThrottleCleanupLimit(10001)).toBeNull();
    expect(parseThrottleCleanupLimit('0')).toBeNull();
  });

  it('parses retention-day bounds', () => {
    expect(parseThrottleRetentionDays(undefined, 30)).toBe(30);
    expect(parseThrottleRetentionDays(1)).toBe(1);
    expect(parseThrottleRetentionDays(365)).toBe(365);
    expect(parseThrottleRetentionDays(0)).toBeNull();
    expect(parseThrottleRetentionDays(366)).toBeNull();
  });

  it('returns dry-run result without deleting', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([{ id: 'row_1' }, { id: 'row_2' }]);
    const result = await cleanupStaleLoginRequestThrottleRows({
      dryRun: true,
      limit: 100,
      retentionDays: 45,
    });

    expect(result).toEqual({
      ok: true,
      dryRun: true,
      scanned: 2,
      deleted: 0,
      retentionDays: 45,
    });
    expect(mocks.mockDelete).not.toHaveBeenCalled();
  });

  it('deletes stale rows when not dry-run', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([{ id: 'row_1' }, { id: 'row_2' }, { id: 'row_3' }]);
    mocks.mockDeleteReturning.mockResolvedValueOnce([{ id: 'row_1' }, { id: 'row_2' }]);

    const result = await cleanupStaleLoginRequestThrottleRows({
      dryRun: false,
      limit: 100,
      retentionDays: 30,
    });

    expect(result).toEqual({
      ok: true,
      dryRun: false,
      scanned: 3,
      deleted: 2,
      retentionDays: 30,
    });
    expect(mocks.mockDelete).toHaveBeenCalledTimes(1);
  });
});
