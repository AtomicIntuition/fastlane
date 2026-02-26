import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockProcessEvent = vi.fn();

  const mockGetWebhookSecret = vi.fn();
  const mockVerifySignature = vi.fn();

  const mockInsertReturning = vi.fn();
  const mockInsertOnConflict = vi.fn(() => ({ returning: mockInsertReturning }));
  const mockInsertValues = vi.fn(() => ({ onConflictDoNothing: mockInsertOnConflict }));
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

  const mockUpdateWhere = vi.fn(async () => []);
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

  return {
    mockProcessEvent,
    mockGetWebhookSecret,
    mockVerifySignature,
    mockInsertReturning,
    mockInsertOnConflict,
    mockInsertValues,
    mockInsert,
    mockSelectLimit,
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
  };
});

vi.mock('@/lib/fastlane/webhook-processor', () => ({
  processFastLaneStripeEvent: mocks.mockProcessEvent,
}));

vi.mock('@/lib/fastlane/stripe', () => ({
  getStripeWebhookSecret: mocks.mockGetWebhookSecret,
  verifyStripeWebhookSignature: mocks.mockVerifySignature,
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
  },
}));

import { POST } from '@/app/api/fastlane/billing/webhook/route';

describe('FastLane billing webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetWebhookSecret.mockReturnValue('whsec_test');
    mocks.mockVerifySignature.mockReturnValue(true);
    mocks.mockInsertReturning.mockResolvedValue([{ id: 'we_1' }]);
    mocks.mockSelectLimit.mockResolvedValue([]);
  });

  it('rejects request without signature header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('rejects whitespace-only signature header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': '   ',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Missing stripe-signature header/i);
    expect(mocks.mockVerifySignature).not.toHaveBeenCalled();
  });

  it('rejects oversized signature header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 'a'.repeat(4097),
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid Stripe signature/i);
    expect(mocks.mockVerifySignature).not.toHaveBeenCalled();
  });

  it('rejects non-json content-type header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }),
      headers: {
        'content-type': 'text/plain',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-type header/i);
    expect(mocks.mockVerifySignature).not.toHaveBeenCalled();
    expect(mocks.mockInsert).not.toHaveBeenCalled();
  });

  it('accepts application/json content-type with charset', async () => {
    mocks.mockVerifySignature.mockReturnValue(false);

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }),
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'stripe-signature': 't=1,v1=bad',
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mocks.mockVerifySignature).toHaveBeenCalledOnce();
  });

  it('rejects malformed content-length header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
        'content-length': 'abc',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-length header/i);
    expect(mocks.mockVerifySignature).not.toHaveBeenCalled();
    expect(mocks.mockInsert).not.toHaveBeenCalled();
  });

  it('rejects oversized content-length header before reading full body', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: '{}',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
        'content-length': '1000001',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(mocks.mockVerifySignature).not.toHaveBeenCalled();
    expect(mocks.mockInsert).not.toHaveBeenCalled();
  });

  it('rejects oversized webhook payload before signature verification', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: 'x'.repeat(1_000_001),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(mocks.mockVerifySignature).not.toHaveBeenCalled();
    expect(mocks.mockInsert).not.toHaveBeenCalled();
  });

  it('rejects multibyte payloads that exceed byte limit even when character count is lower', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: '😀'.repeat(300_000), // 300k chars, ~1.2MB UTF-8
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(mocks.mockVerifySignature).not.toHaveBeenCalled();
    expect(mocks.mockInsert).not.toHaveBeenCalled();
  });

  it('rejects unknown query parameters', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook?foo=bar', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
    expect(mocks.mockVerifySignature).not.toHaveBeenCalled();
    expect(mocks.mockInsert).not.toHaveBeenCalled();
  });

  it('returns 500 when webhook secret is not configured', async () => {
    mocks.mockGetWebhookSecret.mockImplementationOnce(() => {
      throw new Error('STRIPE_WEBHOOK_SECRET missing');
    });

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/signing secret not configured/i);
    expect(mocks.mockVerifySignature).not.toHaveBeenCalled();
  });

  it('rejects invalid webhook signature', async () => {
    mocks.mockVerifySignature.mockReturnValue(false);

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=bad',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects malformed json payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: '{',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid JSON payload/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects non-object json payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify([]),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid JSON payload/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects payload missing event type', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_missing_type' }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Missing Stripe event type/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects payload with whitespace-only event type', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_blank_type', type: '   ' }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Missing Stripe event type/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects payload with non-string event id', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 12345, type: 'checkout.session.completed' }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Missing Stripe event id/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects payload with overlong event id', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'e'.repeat(101), type: 'checkout.session.completed' }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid Stripe event id/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects payload with invalid event id format', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'event_123', type: 'checkout.session.completed' }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid Stripe event id/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects payload with overlong event type', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_long_type', type: 't'.repeat(101) }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid Stripe event type/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects payload with invalid event type format', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_bad_type', type: 'checkout session completed' }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid Stripe event type/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('accepts payload with additional stripe top-level metadata fields', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({
        id: 'evt_unknown_field',
        type: 'checkout.session.completed',
        object: 'event',
        livemode: false,
        pending_webhooks: 0,
        created: 1_700_000_000,
        api_version: '2025-01-01',
      }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(mocks.mockInsert).toHaveBeenCalledTimes(1);
    expect(mocks.mockProcessEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects payload with invalid data shape', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({
        id: 'evt_bad_data',
        type: 'checkout.session.completed',
        data: 'not-an-object',
      }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid Stripe event data/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects payload with invalid data.object shape', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({
        id: 'evt_bad_object',
        type: 'checkout.session.completed',
        data: { object: 'not-an-object' },
      }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid Stripe event object/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('returns duplicate=true when event id already processed', async () => {
    mocks.mockInsertReturning.mockResolvedValue([]);
    mocks.mockSelectLimit.mockResolvedValueOnce([
      {
        stripeEventId: 'evt_duplicate',
        processed: true,
        replayCount: 0,
      },
    ]);

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_duplicate', type: 'checkout.session.completed' }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true, duplicate: true });
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('retries duplicate event when prior attempt failed', async () => {
    const event = {
      id: 'evt_retry',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1' } },
    };
    mocks.mockInsertReturning.mockResolvedValueOnce([]);
    mocks.mockSelectLimit.mockResolvedValueOnce([
      {
        stripeEventId: 'evt_retry',
        processed: false,
        replayCount: 2,
      },
    ]);

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true, retried: true });
    expect(mocks.mockProcessEvent).toHaveBeenCalledWith(event);
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        processed: true,
        processedAt: expect.any(Date),
        error: null,
        replayCount: 3,
        lastReplayAt: expect.any(Date),
        lastReplayedBy: 'stripe-retry',
      }),
    );
  });

  it('processes event and marks webhook row processed', async () => {
    const event = {
      id: 'evt_checkout_1',
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_1' } },
    };

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(mocks.mockProcessEvent).toHaveBeenCalledWith(event);
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ processed: true, processedAt: expect.any(Date), error: null }),
    );
  });

  it('returns 500 when webhook persistence layer fails unexpectedly', async () => {
    mocks.mockInsertReturning.mockRejectedValueOnce(new Error('db unavailable'));

    const event = {
      id: 'evt_persist_fail',
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_1' } },
    };
    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Webhook persistence failed/i);
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('normalizes trimmed event type before processing', async () => {
    const event = {
      id: 'evt_trim_type',
      type: ' checkout.session.completed ',
      data: { object: { customer: 'cus_1' } },
    };

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.mockProcessEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'evt_trim_type',
        type: 'checkout.session.completed',
      }),
    );
    expect(mocks.mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeEventId: 'evt_trim_type',
        eventType: 'checkout.session.completed',
        payload: expect.objectContaining({
          id: 'evt_trim_type',
          type: 'checkout.session.completed',
        }),
      }),
    );
  });

  it('stores error on processor failure and returns 500', async () => {
    mocks.mockProcessEvent.mockRejectedValueOnce(new Error('processor failed'));

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_fail', type: 'customer.subscription.updated' }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Webhook processing failed/i);
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ processed: false, error: 'processor failed' }),
    );
  });

  it('truncates oversized processor errors before persisting', async () => {
    const longError = 'z'.repeat(1500);
    mocks.mockProcessEvent.mockRejectedValueOnce(new Error(longError));

    const request = new NextRequest('http://localhost:3000/api/fastlane/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_fail_long', type: 'customer.subscription.updated' }),
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=good',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Webhook processing failed/i);
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ processed: false, error: 'z'.repeat(1000) }),
    );
  });
});
