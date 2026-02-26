import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockEnsureFastLaneUser = vi.fn();
  const mockRequireFastLaneUserId = vi.fn();
  const mockUnauthorized = vi.fn(() =>
    NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
  );
  const mockUpsertFastLaneSubscription = vi.fn();

  const mockCreateStripeCustomer = vi.fn();
  const mockCreateCheckoutSession = vi.fn();

  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

  return {
    mockEnsureFastLaneUser,
    mockRequireFastLaneUserId,
    mockUnauthorized,
    mockUpsertFastLaneSubscription,
    mockCreateStripeCustomer,
    mockCreateCheckoutSession,
    mockSelectLimit,
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
  };
});

vi.mock('@/lib/fastlane/server', () => ({
  ensureFastLaneUser: mocks.mockEnsureFastLaneUser,
  requireFastLaneUserId: mocks.mockRequireFastLaneUserId,
  unauthorized: mocks.mockUnauthorized,
  upsertFastLaneSubscription: mocks.mockUpsertFastLaneSubscription,
}));

vi.mock('@/lib/fastlane/stripe', () => ({
  createStripeCustomer: mocks.mockCreateStripeCustomer,
  createCheckoutSession: mocks.mockCreateCheckoutSession,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.mockSelect,
  },
}));

import { POST } from '@/app/api/fastlane/billing/checkout/route';

describe('FastLane billing checkout route', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialNodeEnv = env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockRequireFastLaneUserId.mockReturnValue('user_1');
    mocks.mockEnsureFastLaneUser.mockResolvedValue({ id: 'fl_u1', userId: 'user_1', email: 'u@example.com' });
    mocks.mockSelectLimit.mockResolvedValue([]);
    mocks.mockCreateStripeCustomer.mockResolvedValue({ id: 'cus_new' });
    mocks.mockCreateCheckoutSession.mockResolvedValue({ id: 'cs_123', url: 'https://checkout.stripe.com/test' });
    mocks.mockUpsertFastLaneSubscription.mockResolvedValue(undefined);

    process.env.STRIPE_PRICE_MONTHLY = 'price_monthly';
    process.env.STRIPE_PRICE_YEARLY = 'price_yearly';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    env.NODE_ENV = initialNodeEnv;
  });

  it('returns unauthorized when user id is missing', async () => {
    mocks.mockRequireFastLaneUserId.mockReturnValue(null);

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('rejects unknown query parameters', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout?foo=bar', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
    expect(mocks.mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('returns 500 when plan price id is missing', async () => {
    delete process.env.STRIPE_PRICE_MONTHLY;

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Missing Stripe price ID/i);
  });

  it('returns 500 when NEXT_PUBLIC_APP_URL is invalid', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'not-a-url';

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/NEXT_PUBLIC_APP_URL/i);
    expect(mocks.mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('returns 500 in production when NEXT_PUBLIC_APP_URL is missing', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    env.NODE_ENV = 'production';

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/NEXT_PUBLIC_APP_URL/i);
    expect(mocks.mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('creates customer and checkout session when subscription customer does not exist', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'yearly' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.mockCreateStripeCustomer).toHaveBeenCalledWith('u@example.com', {
      userId: 'user_1',
      product: 'fastlane',
    });
    expect(mocks.mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_new',
        priceId: 'price_yearly',
        metadata: { userId: 'user_1', plan: 'yearly' },
      }),
    );
    expect(mocks.mockUpsertFastLaneSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        stripeCustomerId: 'cus_new',
        status: 'incomplete',
        plan: 'yearly',
      }),
    );
    expect(body.checkoutUrl).toBe('https://checkout.stripe.com/test');
  });

  it('rejects invalid plan values', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'weekly' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid plan/i);
    expect(mocks.mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects unknown fields in payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly', coupon: 'SPRING' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown field/i);
    expect(mocks.mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects malformed json payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: '{',
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid JSON body/i);
    expect(mocks.mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects malformed content-length header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly' }),
      headers: {
        'content-type': 'application/json',
        'content-length': 'abc',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-length header/i);
    expect(mocks.mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects oversized content-length header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: '{}',
      headers: {
        'content-type': 'application/json',
        'content-length': '4097',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(mocks.mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects oversized request body', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: 'x'.repeat(5000),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(mocks.mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects non-json content-type header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly' }),
      headers: { 'content-type': 'text/plain' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-type header/i);
    expect(mocks.mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('accepts json content-type with charset', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly' }),
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('rejects non-object json payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify([]),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid JSON body/i);
    expect(mocks.mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('reuses existing stripe customer id from subscription row', async () => {
    mocks.mockSelectLimit.mockResolvedValue([{ stripeCustomerId: 'cus_existing' }]);

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(mocks.mockCreateStripeCustomer).not.toHaveBeenCalled();
    expect(mocks.mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_existing',
        priceId: 'price_monthly',
      }),
    );
  });

  it('does not downgrade active subscriptions to incomplete during checkout', async () => {
    mocks.mockSelectLimit.mockResolvedValue([{ stripeCustomerId: 'cus_active', status: 'active' }]);

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.mockUpsertFastLaneSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        stripeCustomerId: 'cus_active',
        plan: 'monthly',
      }),
    );
    expect(mocks.mockUpsertFastLaneSubscription).toHaveBeenCalledWith(
      expect.not.objectContaining({
        status: 'incomplete',
      }),
    );
  });

  it('returns 502 when stripe checkout session creation fails', async () => {
    mocks.mockCreateCheckoutSession.mockRejectedValueOnce(new Error('stripe down'));

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toMatch(/Billing provider unavailable/i);
    expect(mocks.mockUpsertFastLaneSubscription).not.toHaveBeenCalled();
    expect(mocks.mockCreateStripeCustomer).toHaveBeenCalledTimes(1);
  });

  it('returns 502 when stripe checkout session has no hosted url', async () => {
    mocks.mockCreateCheckoutSession.mockResolvedValueOnce({ id: 'cs_no_url', url: null });

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toMatch(/Billing provider unavailable/i);
    expect(mocks.mockUpsertFastLaneSubscription).not.toHaveBeenCalled();
  });

  it('returns checkout url even when subscription persistence fails after session creation', async () => {
    mocks.mockUpsertFastLaneSubscription.mockRejectedValueOnce(new Error('db temporary failure'));

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checkoutUrl).toBe('https://checkout.stripe.com/test');
    expect(body.sessionId).toBe('cs_123');
    expect(mocks.mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('recovers from stale stored customer id by creating a new customer and retrying checkout', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([{ stripeCustomerId: 'cus_stale' }]);
    mocks.mockCreateCheckoutSession
      .mockRejectedValueOnce(new Error('customer not found'))
      .mockResolvedValueOnce({ id: 'cs_retry', url: 'https://checkout.stripe.com/retry' });
    mocks.mockCreateStripeCustomer.mockResolvedValueOnce({ id: 'cus_fresh' });

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.mockCreateStripeCustomer).toHaveBeenCalledWith('u@example.com', {
      userId: 'user_1',
      product: 'fastlane',
    });
    expect(mocks.mockCreateCheckoutSession).toHaveBeenCalledTimes(2);
    expect(mocks.mockCreateCheckoutSession).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ customerId: 'cus_stale' }),
    );
    expect(mocks.mockCreateCheckoutSession).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ customerId: 'cus_fresh' }),
    );
    expect(body.checkoutUrl).toBe('https://checkout.stripe.com/retry');
    expect(body.sessionId).toBe('cs_retry');
  });

  it('does not recover with a new customer on generic checkout provider errors', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([{ stripeCustomerId: 'cus_existing' }]);
    mocks.mockCreateCheckoutSession.mockRejectedValueOnce(new Error('stripe unavailable'));

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toMatch(/Billing provider unavailable/i);
    expect(mocks.mockCreateStripeCustomer).not.toHaveBeenCalled();
    expect(mocks.mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when checkout initialization fails before provider calls', async () => {
    mocks.mockEnsureFastLaneUser.mockRejectedValueOnce(new Error('db offline'));

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'monthly' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Unable to initialize checkout/i);
    expect(mocks.mockCreateStripeCustomer).not.toHaveBeenCalled();
    expect(mocks.mockCreateCheckoutSession).not.toHaveBeenCalled();
  });
});
