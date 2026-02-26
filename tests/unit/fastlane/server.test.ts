import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockSelectLimit = vi.fn();
  const mockSelectOrderBy = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectWhere = vi.fn(() => ({ orderBy: mockSelectOrderBy, limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

  const mockInsertReturning = vi.fn();
  const mockInsertOnConflictDoNothing = vi.fn(() => ({ returning: mockInsertReturning }));
  const mockInsertValues = vi.fn(() => ({ onConflictDoNothing: mockInsertOnConflictDoNothing }));
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

  const mockUpdateWhere = vi.fn(async () => []);
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

  return {
    mockSelectLimit,
    mockSelectOrderBy,
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockInsertReturning,
    mockInsertOnConflictDoNothing,
    mockInsertValues,
    mockInsert,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.mockSelect,
    insert: mocks.mockInsert,
    update: mocks.mockUpdate,
  },
}));

import {
  ensureFastLaneUser,
  getEffectiveFastLaneTier,
  getFastLaneStateForUser,
  upsertFastLaneSubscription,
} from '@/lib/fastlane/server';

describe('fastlane server helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ensureFastLaneUser returns existing row without insert', async () => {
    const existing = { id: 'fl_1', userId: 'u1' };
    mocks.mockSelectLimit.mockResolvedValueOnce([existing]);

    const result = await ensureFastLaneUser('u1');

    expect(result).toEqual(existing);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
  });

  it('ensureFastLaneUser inserts when no row exists', async () => {
    const inserted = { id: 'fl_2', userId: 'u2' };
    mocks.mockSelectLimit.mockResolvedValueOnce([]);
    mocks.mockInsertReturning.mockResolvedValueOnce([inserted]);

    const result = await ensureFastLaneUser('u2');

    expect(result).toEqual(inserted);
    expect(mocks.mockInsert).toHaveBeenCalledTimes(1);
    expect(mocks.mockInsertOnConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(mocks.mockSelectLimit).toHaveBeenCalledTimes(1);
  });

  it('ensureFastLaneUser resolves conflict by fetching existing row', async () => {
    const afterConflict = { id: 'fl_3', userId: 'u3' };
    mocks.mockSelectLimit.mockResolvedValueOnce([]).mockResolvedValueOnce([afterConflict]);
    mocks.mockInsertReturning.mockResolvedValueOnce([]);

    const result = await ensureFastLaneUser('u3');

    expect(result).toEqual(afterConflict);
    expect(mocks.mockInsert).toHaveBeenCalledTimes(1);
    expect(mocks.mockSelectLimit).toHaveBeenCalledTimes(2);
  });

  it('ensureFastLaneUser throws if conflict fallback row is missing', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mocks.mockInsertReturning.mockResolvedValueOnce([]);

    await expect(ensureFastLaneUser('u_missing')).rejects.toThrow(
      /Failed to load FastLane user after conflict/i,
    );
  });

  it('getFastLaneStateForUser normalizes invalid stored profile protocol id', async () => {
    mocks.mockSelectLimit
      .mockResolvedValueOnce([
        {
          id: 'fl_u8',
          userId: 'u8',
          onboarded: true,
          tier: 'free',
          goal: 'energy',
          experience: 'new',
          protocolId: 'legacy_invalid_protocol',
          wakeTime: '07:00',
          sleepTime: '23:00',
          reminders: true,
          activeFastStartAt: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const state = await getFastLaneStateForUser('u8');

    expect(state.profile.protocolId).toBe('16_8');
  });

  it('getFastLaneStateForUser resolves stale cached pro tier to free for canceled subscriptions', async () => {
    mocks.mockSelectLimit
      .mockResolvedValueOnce([
        {
          id: 'fl_u9',
          userId: 'u9',
          onboarded: true,
          tier: 'pro',
          goal: 'energy',
          experience: 'new',
          protocolId: '16_8',
          wakeTime: '07:00',
          sleepTime: '23:00',
          reminders: true,
          activeFastStartAt: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: 'canceled' }]);

    const state = await getFastLaneStateForUser('u9');

    expect(state.tier).toBe('free');
  });

  it('getFastLaneStateForUser resolves active subscriptions to pro tier', async () => {
    mocks.mockSelectLimit
      .mockResolvedValueOnce([
        {
          id: 'fl_u10',
          userId: 'u10',
          onboarded: true,
          tier: 'free',
          goal: 'energy',
          experience: 'new',
          protocolId: '16_8',
          wakeTime: '07:00',
          sleepTime: '23:00',
          reminders: true,
          activeFastStartAt: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: 'active' }]);

    const state = await getFastLaneStateForUser('u10');

    expect(state.tier).toBe('pro');
  });

  it('getFastLaneStateForUser defaults to free when no subscription row exists', async () => {
    mocks.mockSelectLimit
      .mockResolvedValueOnce([
        {
          id: 'fl_u11',
          userId: 'u11',
          onboarded: true,
          tier: 'pro',
          goal: 'energy',
          experience: 'new',
          protocolId: '16_8',
          wakeTime: '07:00',
          sleepTime: '23:00',
          reminders: true,
          activeFastStartAt: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const state = await getFastLaneStateForUser('u11');

    expect(state.tier).toBe('free');
  });

  it('upsertFastLaneSubscription updates existing row and skips insert', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([{ id: 'sub_1', userId: 'u4' }]);

    await upsertFastLaneSubscription({
      userId: 'u4',
      stripeCustomerId: 'cus_1',
      status: 'active',
      plan: 'monthly',
    });

    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.mockUpdateSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        stripeCustomerId: 'cus_1',
        status: 'active',
        plan: 'monthly',
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('upsertFastLaneSubscription handles insert conflict with fallback update', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([]);
    mocks.mockInsertReturning.mockResolvedValueOnce([]);

    await upsertFastLaneSubscription({
      userId: 'u5',
      stripeCustomerId: 'cus_2',
      status: 'incomplete',
      plan: 'yearly',
    });

    expect(mocks.mockInsert).toHaveBeenCalledTimes(1);
    expect(mocks.mockInsertOnConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(mocks.mockUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.mockUpdateSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        stripeCustomerId: 'cus_2',
        status: 'incomplete',
        plan: 'yearly',
        updatedAt: expect.any(Date),
      }),
    );
    expect(mocks.mockUpdateSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tier: 'free',
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('upsertFastLaneSubscription does not update user tier when status is omitted', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([{ id: 'sub_6', userId: 'u6' }]);

    await upsertFastLaneSubscription({
      userId: 'u6',
      stripeCustomerId: 'cus_6',
      plan: 'monthly',
    });

    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: 'cus_6',
        plan: 'monthly',
        updatedAt: expect.any(Date),
      }),
    );
    expect(mocks.mockUpdateSet).not.toHaveBeenCalledWith(expect.objectContaining({ tier: 'free' }));
    expect(mocks.mockUpdateSet).not.toHaveBeenCalledWith(expect.objectContaining({ tier: 'pro' }));
  });

  it('upsertFastLaneSubscription downgrades paused subscriptions to free tier', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([{ id: 'sub_7', userId: 'u7' }]);

    await upsertFastLaneSubscription({
      userId: 'u7',
      status: 'paused',
    });

    expect(mocks.mockUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.mockUpdateSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tier: 'free',
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('upsertFastLaneSubscription ignores invalid stripe ids and plan on update', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([{ id: 'sub_invalid', userId: 'u_invalid' }]);

    await upsertFastLaneSubscription({
      userId: 'u_invalid',
      stripeCustomerId: 'customer-not-stripe',
      stripeSubscriptionId: 'sub ' + 'x'.repeat(120),
      plan: 'enterprise',
      status: 'active',
    });

    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.mockUpdateSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        status: 'active',
        updatedAt: expect.any(Date),
      }),
    );
    expect(mocks.mockUpdateSet).toHaveBeenNthCalledWith(
      1,
      expect.not.objectContaining({
        stripeCustomerId: expect.anything(),
      }),
    );
    expect(mocks.mockUpdateSet).toHaveBeenNthCalledWith(
      1,
      expect.not.objectContaining({
        stripeSubscriptionId: expect.anything(),
      }),
    );
    expect(mocks.mockUpdateSet).toHaveBeenNthCalledWith(
      1,
      expect.not.objectContaining({
        plan: expect.anything(),
      }),
    );
  });

  it('upsertFastLaneSubscription persists null-safe normalized values on insert', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([]);
    mocks.mockInsertReturning.mockResolvedValueOnce([{ id: 'sub_inserted' }]);

    await upsertFastLaneSubscription({
      userId: 'u_insert',
      stripeCustomerId: ' ',
      stripeSubscriptionId: null,
      plan: ' ',
      status: 'incomplete',
    });

    expect(mocks.mockInsert).toHaveBeenCalledTimes(1);
    expect(mocks.mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u_insert',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        plan: null,
        status: 'incomplete',
      }),
    );
  });

  it('getEffectiveFastLaneTier returns pro when subscription status is active', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([{ status: 'active' }]);
    await expect(getEffectiveFastLaneTier('u_pro', 'free')).resolves.toBe('pro');
  });

  it('getEffectiveFastLaneTier returns free on non-active subscription statuses', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([{ status: 'canceled' }]);
    await expect(getEffectiveFastLaneTier('u_free', 'pro')).resolves.toBe('free');
  });
});
