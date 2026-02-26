import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockFindBySubscriptionId: vi.fn(),
  mockGetByCustomer: vi.fn(),
  mockUpsert: vi.fn(),
}));

vi.mock('@/lib/fastlane/server', () => ({
  findFastLaneSubscriptionByStripeSubscriptionId: mocks.mockFindBySubscriptionId,
  getFastLaneSubscriptionByCustomer: mocks.mockGetByCustomer,
  upsertFastLaneSubscription: mocks.mockUpsert,
}));

import { processFastLaneStripeEvent } from '@/lib/fastlane/webhook-processor';

describe('fastlane webhook processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_MONTHLY = 'price_monthly';
    process.env.STRIPE_PRICE_YEARLY = 'price_yearly';
  });

  it('handles expanded object ids on checkout.session.completed', async () => {
    await processFastLaneStripeEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: { id: 'cus_obj' },
          subscription: { id: 'sub_obj' },
          metadata: { userId: 'user_1', plan: 'monthly' },
        },
      },
    });

    expect(mocks.mockUpsert).toHaveBeenCalledWith({
      userId: 'user_1',
      stripeCustomerId: 'cus_obj',
      stripeSubscriptionId: 'sub_obj',
      status: 'active',
      plan: 'monthly',
    });
  });

  it('normalizes invalid checkout metadata plan to null', async () => {
    await processFastLaneStripeEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: { id: 'cus_obj' },
          subscription: { id: 'sub_obj' },
          metadata: { userId: 'user_invalid_plan', plan: 'weekly' },
        },
      },
    });

    expect(mocks.mockUpsert).toHaveBeenCalledWith({
      userId: 'user_invalid_plan',
      stripeCustomerId: 'cus_obj',
      stripeSubscriptionId: 'sub_obj',
      status: 'active',
      plan: null,
    });
  });

  it('falls back unknown subscription status to incomplete and parses cancel flag strictly', async () => {
    mocks.mockFindBySubscriptionId.mockResolvedValueOnce({
      userId: 'user_2',
      stripeCustomerId: 'cus_existing',
      stripeSubscriptionId: 'sub_existing',
    });

    await processFastLaneStripeEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_existing',
          customer: { id: 'cus_expanded' },
          status: 'new_unexpected_status',
          cancel_at_period_end: 'false',
          current_period_end: 1_800_000_000,
          items: {
            data: [{ price: { id: 'price_yearly' } }],
          },
        },
      },
    });

    expect(mocks.mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_2',
        stripeCustomerId: 'cus_expanded',
        stripeSubscriptionId: 'sub_existing',
        status: 'incomplete',
        plan: 'yearly',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: expect.any(Date),
      }),
    );
  });

  it('handles renewal update with active status and period end', async () => {
    mocks.mockFindBySubscriptionId.mockResolvedValueOnce({
      userId: 'user_renewal',
      stripeCustomerId: 'cus_renewal',
      stripeSubscriptionId: 'sub_renewal',
    });

    await processFastLaneStripeEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_renewal',
          customer: { id: 'cus_renewal' },
          status: 'active',
          cancel_at_period_end: false,
          current_period_end: 1_950_000_000,
          items: {
            data: [{ price: { id: 'price_yearly' } }],
          },
        },
      },
    });

    expect(mocks.mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_renewal',
        stripeCustomerId: 'cus_renewal',
        stripeSubscriptionId: 'sub_renewal',
        status: 'active',
        plan: 'yearly',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: expect.any(Date),
      }),
    );
  });

  it('handles scheduled cancellation while subscription remains active', async () => {
    mocks.mockFindBySubscriptionId.mockResolvedValueOnce({
      userId: 'user_cancel_scheduled',
      stripeCustomerId: 'cus_cancel_scheduled',
      stripeSubscriptionId: 'sub_cancel_scheduled',
    });

    await processFastLaneStripeEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_cancel_scheduled',
          customer: { id: 'cus_cancel_scheduled' },
          status: 'active',
          cancel_at_period_end: true,
          current_period_end: 1_960_000_000,
          items: {
            data: [{ price: { id: 'price_monthly' } }],
          },
        },
      },
    });

    expect(mocks.mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_cancel_scheduled',
        stripeCustomerId: 'cus_cancel_scheduled',
        stripeSubscriptionId: 'sub_cancel_scheduled',
        status: 'active',
        plan: 'monthly',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: expect.any(Date),
      }),
    );
  });

  it('looks up subscription by expanded customer id when subscription id is unknown', async () => {
    mocks.mockFindBySubscriptionId.mockResolvedValueOnce(null);
    mocks.mockGetByCustomer.mockResolvedValueOnce({
      userId: 'user_3',
      stripeCustomerId: 'cus_lookup',
      stripeSubscriptionId: 'sub_lookup',
    });

    await processFastLaneStripeEvent({
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_new',
          customer: { id: 'cus_lookup' },
          status: 'trialing',
          cancel_at_period_end: false,
          current_period_end: 1_900_000_000,
          items: {
            data: [{ price: { id: 'price_monthly' } }],
          },
        },
      },
    });

    expect(mocks.mockGetByCustomer).toHaveBeenCalledWith('cus_lookup');
    expect(mocks.mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_3',
        stripeCustomerId: 'cus_lookup',
        stripeSubscriptionId: 'sub_new',
        status: 'trialing',
        plan: 'monthly',
      }),
    );
  });

  it('skips subscription-id lookup when subscription id is missing and falls back to customer lookup', async () => {
    mocks.mockGetByCustomer.mockResolvedValueOnce({
      userId: 'user_5',
      stripeCustomerId: 'cus_missing_id',
      stripeSubscriptionId: 'sub_existing_5',
    });

    await processFastLaneStripeEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: null,
          customer: { id: 'cus_missing_id' },
          status: 'active',
          cancel_at_period_end: false,
          current_period_end: 1_910_000_000,
          items: {
            data: [{ price: { id: 'price_monthly' } }],
          },
        },
      },
    });

    expect(mocks.mockFindBySubscriptionId).not.toHaveBeenCalled();
    expect(mocks.mockGetByCustomer).toHaveBeenCalledWith('cus_missing_id');
    expect(mocks.mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_5',
        stripeCustomerId: 'cus_missing_id',
        stripeSubscriptionId: 'sub_existing_5',
        status: 'active',
      }),
    );
  });

  it('falls back to customer lookup for customer.subscription.deleted events', async () => {
    mocks.mockFindBySubscriptionId.mockResolvedValueOnce(null);
    mocks.mockGetByCustomer.mockResolvedValueOnce({
      userId: 'user_4',
      stripeCustomerId: 'cus_deleted',
      stripeSubscriptionId: 'sub_old',
    });

    await processFastLaneStripeEvent({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: '',
          customer: { id: 'cus_deleted' },
        },
      },
    });

    expect(mocks.mockGetByCustomer).toHaveBeenCalledWith('cus_deleted');
    expect(mocks.mockUpsert).toHaveBeenCalledWith({
      userId: 'user_4',
      status: 'canceled',
    });
  });
});
