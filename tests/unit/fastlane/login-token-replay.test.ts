import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isConsumedLoginToken,
  markLoginTokenConsumed,
} from '@/lib/fastlane/login-token-replay';

const mocks = vi.hoisted(() => {
  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));
  const mockInsertReturning = vi.fn();
  const mockInsertOnConflictDoNothing = vi.fn(() => ({ returning: mockInsertReturning }));
  const mockInsertValues = vi.fn(() => ({ onConflictDoNothing: mockInsertOnConflictDoNothing }));
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
  return {
    mockSelectLimit,
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockInsertReturning,
    mockInsertOnConflictDoNothing,
    mockInsertValues,
    mockInsert,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.mockSelect,
    insert: mocks.mockInsert,
  },
}));

describe('login token replay store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockSelectLimit.mockResolvedValue([]);
    mocks.mockInsertReturning.mockResolvedValue([{ id: 'replay_1' }]);
  });

  it('marks token consumed when first inserted', async () => {
    const inserted = await markLoginTokenConsumed('token-replay-1', 1_700_000_060_000);
    expect(inserted).toBe(true);
    expect(mocks.mockInsert).toHaveBeenCalledTimes(1);
  });

  it('returns false when token hash already exists', async () => {
    mocks.mockInsertReturning.mockResolvedValueOnce([]);
    const inserted = await markLoginTokenConsumed('token-replay-2', 1_700_000_060_000);
    expect(inserted).toBe(false);
  });

  it('checks active replay markers by expiry timestamp', async () => {
    const token = 'token-replay-2';
    const now = 1_700_000_000_000;
    mocks.mockSelectLimit.mockResolvedValueOnce([{ id: 'replay_1' }]);
    expect(await isConsumedLoginToken(token, now)).toBe(true);

    mocks.mockSelectLimit.mockResolvedValueOnce([]);
    expect(await isConsumedLoginToken(token, now + 2_000)).toBe(false);
  });
});
