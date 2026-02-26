import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockProcessEvent = vi.fn();

  const mockSelectLimit = vi.fn();
  const mockSelectOrderBy = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectWhere = vi.fn(() => ({ orderBy: mockSelectOrderBy, limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere, limit: mockSelectLimit }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

  const mockUpdateWhere = vi.fn(async () => []);
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

  const mockIsAdminAuthorized = vi.fn();
  const mockHasValidAdminCsrfRequest = vi.fn();

  return {
    mockProcessEvent,
    mockSelectLimit,
    mockSelectOrderBy,
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
    mockIsAdminAuthorized,
    mockHasValidAdminCsrfRequest,
  };
});

vi.mock('@/lib/fastlane/webhook-processor', () => ({
  processFastLaneStripeEvent: mocks.mockProcessEvent,
}));

vi.mock('@/lib/utils/admin-session-cookie', () => ({
  isAdminAuthorized: mocks.mockIsAdminAuthorized,
}));

vi.mock('@/lib/utils/admin-csrf', () => ({
  hasValidAdminCsrfRequest: mocks.mockHasValidAdminCsrfRequest,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
  },
}));

import { GET, POST } from '@/app/api/admin/fastlane/webhook/reprocess/route';

describe('Admin FastLane webhook reprocess route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockIsAdminAuthorized.mockReturnValue(true);
    mocks.mockHasValidAdminCsrfRequest.mockReturnValue(true);
  });

  it('requires authorization for GET', async () => {
    mocks.mockIsAdminAuthorized.mockReturnValue(false);

    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'GET',
    });

    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('lists failed events on GET', async () => {
    mocks.mockSelectLimit.mockResolvedValue([
      {
        id: 'we_1',
        stripeEventId: 'evt_1',
        eventType: 'checkout.session.completed',
        error: 'boom',
        replayCount: 2,
        lastReplayAt: new Date('2026-01-02T00:00:00.000Z'),
        lastReplayedBy: 'ops-a',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess?limit=10', {
      method: 'GET',
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.failedEvents).toHaveLength(1);
    expect(body.failedEvents[0].stripeEventId).toBe('evt_1');
    expect(body.failedEvents[0].replayCount).toBe(2);
    expect(body.failedEvents[0].lastReplayedBy).toBe('ops-a');
  });

  it('rejects invalid GET query limit values', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess?limit=1.5', {
      method: 'GET',
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid limit/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
  });

  it('rejects GET query limit values above 100', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess?limit=101', {
      method: 'GET',
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid limit/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
  });

  it('rejects unknown GET query parameters', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/fastlane/webhook/reprocess?limit=10&cursor=abc',
      {
        method: 'GET',
      },
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
  });

  it('returns 500 when GET failed-events query throws unexpectedly', async () => {
    mocks.mockSelectLimit.mockRejectedValueOnce(new Error('db offline'));

    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'GET',
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Unable to load failed events/i);
  });

  it('reprocesses matching events on POST', async () => {
    mocks.mockSelectLimit.mockResolvedValue([
      {
        stripeEventId: 'evt_1',
        replayCount: 0,
        payload: { id: 'evt_1', type: 'checkout.session.completed', data: { object: {} } },
      },
      {
        stripeEventId: 'evt_2',
        replayCount: 3,
        payload: { id: 'evt_2', type: 'customer.subscription.updated', data: { object: {} } },
      },
    ]);

    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 2, replayedBy: 'qa-bot' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.mockProcessEvent).toHaveBeenCalledTimes(2);
    expect(body.reprocessed).toBe(2);
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(0);
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        replayCount: expect.any(Number),
        lastReplayAt: expect.any(Date),
        lastReplayedBy: 'qa-bot',
      }),
    );
  });

  it('rejects POST when csrf validation fails', async () => {
    mocks.mockHasValidAdminCsrfRequest.mockReturnValueOnce(false);

    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 1 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/CSRF validation failed/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects malformed json payload on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid JSON body/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects malformed content-length header on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': 'abc',
      },
      body: JSON.stringify({ limit: 1 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-length header/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects oversized content-length header on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '16385',
      },
      body: '{}',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects oversized body payload on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: `${'x'.repeat(17_000)}`,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects non-json content-type on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ limit: 1 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-type header/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('accepts json content-type with charset on POST', async () => {
    mocks.mockSelectLimit.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ limit: 1 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        reprocessed: 0,
        succeeded: 0,
        failed: 0,
      }),
    );
  });

  it('rejects non-object json payload on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([]),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid JSON body/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects invalid stripeEventId payload on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stripeEventId: 123 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid stripeEventId/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects oversized stripeEventId payload on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stripeEventId: 'e'.repeat(101) }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid stripeEventId/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects malformed stripeEventId payload on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stripeEventId: 'event_123' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid stripeEventId/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects invalid limit payload on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 0 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid limit/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects limit payload above 100 on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 101 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid limit/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects non-integer limit payload on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 1.5 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid limit/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects invalid replayedBy payload on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ replayedBy: 123 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid replayedBy/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects oversized replayedBy payload on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ replayedBy: 'x'.repeat(101) }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid replayedBy/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects replayedBy payload with control characters on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ replayedBy: 'ops\nteam' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid replayedBy/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects invalid force payload on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ force: 'true' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid force flag/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects unknown fields on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 1, dryRun: true }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown field/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('rejects unknown query parameters on POST', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess?foo=bar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 1 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('tracks per-event failures during reprocessing', async () => {
    mocks.mockSelectLimit.mockResolvedValue([
      {
        stripeEventId: 'evt_fail',
        replayCount: 4,
        payload: { id: 'evt_fail', type: 'checkout.session.completed', data: { object: {} } },
      },
    ]);
    mocks.mockProcessEvent.mockRejectedValueOnce(new Error('retry failed'));

    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 1, replayedBy: 'ops-2' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.failed).toBe(1);
    expect(body.details[0]).toEqual(
      expect.objectContaining({ stripeEventId: 'evt_fail', ok: false, error: 'retry failed' }),
    );
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        processed: false,
        error: 'retry failed',
        replayCount: 5,
        lastReplayedBy: 'ops-2',
      }),
    );
  });

  it('truncates oversized replay processor errors before persisting and returning details', async () => {
    const longError = 'x'.repeat(1500);
    mocks.mockSelectLimit.mockResolvedValue([
      {
        stripeEventId: 'evt_fail_long',
        replayCount: 0,
        payload: { id: 'evt_fail_long', type: 'checkout.session.completed', data: { object: {} } },
      },
    ]);
    mocks.mockProcessEvent.mockRejectedValueOnce(new Error(longError));

    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 1 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.failed).toBe(1);
    expect(body.details[0]).toEqual(
      expect.objectContaining({
        stripeEventId: 'evt_fail_long',
        ok: false,
        error: 'x'.repeat(1000),
      }),
    );
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        processed: false,
        error: 'x'.repeat(1000),
      }),
    );
  });

  it('refuses replaying already processed targeted events unless force=true', async () => {
    mocks.mockSelectLimit.mockResolvedValue([
      {
        stripeEventId: 'evt_done',
        processed: true,
        replayCount: 1,
        payload: { id: 'evt_done', type: 'checkout.session.completed', data: { object: {} } },
      },
    ]);

    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stripeEventId: 'evt_done' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('already processed');
    expect(mocks.mockProcessEvent).not.toHaveBeenCalled();
  });

  it('returns 500 when POST reprocess lookup throws unexpectedly', async () => {
    mocks.mockSelectLimit.mockRejectedValueOnce(new Error('db offline'));

    const request = new NextRequest('http://localhost:3000/api/admin/fastlane/webhook/reprocess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 1 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Unable to reprocess events/i);
  });
});
