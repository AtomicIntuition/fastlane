import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockEnsureFastLaneUser = vi.fn();
  const mockRequireFastLaneUserId = vi.fn();
  const mockUnauthorized = vi.fn(() =>
    NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
  );
  const mockUpsertFastLaneSubscription = vi.fn();

  const mockCreateBillingPortalSession = vi.fn();
  const mockCreateStripeCustomer = vi.fn();

  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

  return {
    mockEnsureFastLaneUser,
    mockRequireFastLaneUserId,
    mockUnauthorized,
    mockUpsertFastLaneSubscription,
    mockCreateBillingPortalSession,
    mockCreateStripeCustomer,
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
  createBillingPortalSession: mocks.mockCreateBillingPortalSession,
  createStripeCustomer: mocks.mockCreateStripeCustomer,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.mockSelect,
  },
}));

import { POST } from '@/app/api/fastlane/billing/portal/route';

describe('FastLane billing portal route', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialNodeEnv = env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockRequireFastLaneUserId.mockReturnValue('user_1');
    mocks.mockEnsureFastLaneUser.mockResolvedValue({ id: 'fl_u1', userId: 'user_1', email: 'u@example.com' });
    mocks.mockUpsertFastLaneSubscription.mockResolvedValue(undefined);
    mocks.mockSelectLimit.mockResolvedValue([{ stripeCustomerId: 'cus_123' }]);
    mocks.mockCreateStripeCustomer.mockResolvedValue({ id: 'cus_new' });
    mocks.mockCreateBillingPortalSession.mockResolvedValue({
      url: 'https://billing.stripe.com/session/test',
    });
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    env.NODE_ENV = initialNodeEnv;
  });

  it('returns unauthorized when user id is missing', async () => {
    mocks.mockRequireFastLaneUserId.mockReturnValue(null);

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('rejects unknown query parameters', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal?foo=bar', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
    expect(mocks.mockCreateBillingPortalSession).not.toHaveBeenCalled();
  });

  it('rejects malformed json payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid JSON body/i);
    expect(mocks.mockCreateBillingPortalSession).not.toHaveBeenCalled();
  });

  it('rejects malformed content-length header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': 'abc',
      },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-length header/i);
    expect(mocks.mockCreateBillingPortalSession).not.toHaveBeenCalled();
  });

  it('rejects oversized content-length header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '4097',
      },
      body: '{}',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(mocks.mockCreateBillingPortalSession).not.toHaveBeenCalled();
  });

  it('rejects oversized request body', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(5000),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(mocks.mockCreateBillingPortalSession).not.toHaveBeenCalled();
  });

  it('rejects non-json content-type when body is provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-type header/i);
    expect(mocks.mockCreateBillingPortalSession).not.toHaveBeenCalled();
  });

  it('accepts json content-type with charset when body is provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.mockCreateBillingPortalSession).toHaveBeenCalledTimes(1);
  });

  it('rejects non-object json payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([]),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid JSON body/i);
    expect(mocks.mockCreateBillingPortalSession).not.toHaveBeenCalled();
  });

  it('rejects unknown fields in payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ returnTo: '/fastlane/app' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown field/i);
    expect(mocks.mockCreateBillingPortalSession).not.toHaveBeenCalled();
  });

  it('returns 400 when no stripe customer exists', async () => {
    mocks.mockSelectLimit.mockResolvedValue([{}]);

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/No Stripe customer found/i);
  });

  it('returns portal URL when customer exists', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.mockCreateBillingPortalSession).toHaveBeenCalledWith(
      'cus_123',
      'http://localhost:3000/fastlane/app',
    );
    expect(body.url).toBe('https://billing.stripe.com/session/test');
  });

  it('returns 500 when NEXT_PUBLIC_APP_URL is invalid', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'not-a-url';

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/NEXT_PUBLIC_APP_URL/i);
    expect(mocks.mockCreateBillingPortalSession).not.toHaveBeenCalled();
  });

  it('returns 500 in production when NEXT_PUBLIC_APP_URL is missing', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    env.NODE_ENV = 'production';

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/NEXT_PUBLIC_APP_URL/i);
    expect(mocks.mockCreateBillingPortalSession).not.toHaveBeenCalled();
  });

  it('returns 502 when billing portal session creation fails with non-recoverable error', async () => {
    mocks.mockCreateBillingPortalSession.mockRejectedValueOnce(new Error('stripe down'));

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toMatch(/Billing provider unavailable/i);
    expect(mocks.mockCreateStripeCustomer).not.toHaveBeenCalled();
  });

  it('returns 502 when billing portal session has no url', async () => {
    mocks.mockCreateBillingPortalSession.mockResolvedValueOnce({ url: null });

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toMatch(/Billing provider unavailable/i);
  });

  it('recovers from stale stored customer id by creating a new customer and retrying portal session', async () => {
    mocks.mockCreateBillingPortalSession
      .mockRejectedValueOnce(new Error('customer not found'))
      .mockResolvedValueOnce({ url: 'https://billing.stripe.com/session/retry' });
    mocks.mockCreateStripeCustomer.mockResolvedValueOnce({ id: 'cus_recovered' });

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.mockCreateStripeCustomer).toHaveBeenCalledWith('u@example.com', {
      userId: 'user_1',
      product: 'fastlane',
    });
    expect(mocks.mockUpsertFastLaneSubscription).toHaveBeenCalledWith({
      userId: 'user_1',
      stripeCustomerId: 'cus_recovered',
    });
    expect(mocks.mockCreateBillingPortalSession).toHaveBeenCalledTimes(2);
    expect(mocks.mockCreateBillingPortalSession).toHaveBeenNthCalledWith(
      1,
      'cus_123',
      'http://localhost:3000/fastlane/app',
    );
    expect(mocks.mockCreateBillingPortalSession).toHaveBeenNthCalledWith(
      2,
      'cus_recovered',
      'http://localhost:3000/fastlane/app',
    );
    expect(body.url).toBe('https://billing.stripe.com/session/retry');
  });

  it('still returns portal url when recovered-customer upsert fails', async () => {
    mocks.mockCreateBillingPortalSession
      .mockRejectedValueOnce(new Error('customer not found'))
      .mockResolvedValueOnce({ url: 'https://billing.stripe.com/session/retry-2' });
    mocks.mockCreateStripeCustomer.mockResolvedValueOnce({ id: 'cus_recovered_2' });
    mocks.mockUpsertFastLaneSubscription.mockRejectedValueOnce(new Error('db write failed'));

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.mockCreateBillingPortalSession).toHaveBeenNthCalledWith(
      2,
      'cus_recovered_2',
      'http://localhost:3000/fastlane/app',
    );
    expect(body.url).toBe('https://billing.stripe.com/session/retry-2');
  });

  it('returns 500 when portal initialization fails before provider calls', async () => {
    mocks.mockEnsureFastLaneUser.mockRejectedValueOnce(new Error('db offline'));

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/portal', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Unable to initialize billing portal/i);
    expect(mocks.mockCreateStripeCustomer).not.toHaveBeenCalled();
    expect(mocks.mockCreateBillingPortalSession).not.toHaveBeenCalled();
  });
});
