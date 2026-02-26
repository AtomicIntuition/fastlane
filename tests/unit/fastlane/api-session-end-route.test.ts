import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastLaneState } from '@/lib/fastlane/types';

const mocks = vi.hoisted(() => {
  const mockEnsureFastLaneUser = vi.fn();
  const mockGetFastLaneStateForUser = vi.fn();
  const mockRequireFastLaneUserId = vi.fn();
  const mockUnauthorized = vi.fn(() =>
    NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
  );

  const mockInsertValues = vi.fn(async () => []);
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

  const mockUpdateReturning = vi.fn<
    () => Promise<Array<{ protocolId: string | null; activeFastStartAt: Date | null }>>
  >(async () => []);
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }));
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

  return {
    mockEnsureFastLaneUser,
    mockGetFastLaneStateForUser,
    mockRequireFastLaneUserId,
    mockUnauthorized,
    mockInsertValues,
    mockInsert,
    mockUpdateReturning,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
  };
});

vi.mock('@/lib/fastlane/server', () => ({
  ensureFastLaneUser: mocks.mockEnsureFastLaneUser,
  getFastLaneStateForUser: mocks.mockGetFastLaneStateForUser,
  requireFastLaneUserId: mocks.mockRequireFastLaneUserId,
  unauthorized: mocks.mockUnauthorized,
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mocks.mockInsert,
    update: mocks.mockUpdate,
  },
}));

import { POST } from '@/app/api/fastlane/session/end/route';

const fakeState: FastLaneState = {
  onboarded: true,
  tier: 'free',
  profile: {
    goal: 'energy',
    experience: 'new',
    protocolId: '16_8',
    wakeTime: '07:00',
    sleepTime: '23:00',
    reminders: true,
  },
  activeFastStartAt: null,
  sessions: [],
  checkIns: [],
  flags: {
    firstFastStartedTracked: true,
    firstFastCompletedTracked: true,
    postOnboardingPaywallSeen: true,
  },
};

describe('FastLane end session route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockRequireFastLaneUserId.mockReturnValue('test-user');
    mocks.mockEnsureFastLaneUser.mockResolvedValue(undefined);
    mocks.mockGetFastLaneStateForUser.mockResolvedValue(fakeState);
  });

  it('returns unauthorized when user id is missing', async () => {
    mocks.mockRequireFastLaneUserId.mockReturnValue(null);
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/end', {
      method: 'POST',
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('rejects unknown query parameters', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/end?source=widget', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects malformed json payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/end', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid JSON body/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects malformed content-length header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/end', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': 'abc' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-length header/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects oversized content-length header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/end', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '2049' },
      body: '{}',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects oversized request body', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/end', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(3000),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects non-json content-type when body is provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/end', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-type header/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('accepts json content-type with charset when body is provided', async () => {
    mocks.mockUpdateReturning.mockResolvedValue([
      {
        protocolId: '16_8',
        activeFastStartAt: new Date(Date.now() - 30 * 60_000),
      },
    ]);

    const request = new NextRequest('http://localhost:3000/api/fastlane/session/end', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.mockInsert).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown fields in payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/end', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ finalize: true }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown field/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when no active fast exists', async () => {
    mocks.mockUpdateReturning.mockResolvedValue([]);
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/end', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/No active fast/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
  });

  it('inserts session, clears active fast, and returns updated state', async () => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60_000);
    mocks.mockUpdateReturning.mockResolvedValue([
      {
        protocolId: '16_8',
        activeFastStartAt: thirtyMinutesAgo,
      },
    ]);

    const request = new NextRequest('http://localhost:3000/api/fastlane/session/end', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json() as { state: FastLaneState; durationMinutes: number };

    expect(response.status).toBe(200);
    expect(mocks.mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'test-user',
        protocolId: '16_8',
        startAt: thirtyMinutesAgo,
        durationMinutes: expect.any(Number),
      }),
    );
    expect(body.durationMinutes).toBeGreaterThanOrEqual(29);
    expect(body.durationMinutes).toBeLessThanOrEqual(31);
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        activeFastStartAt: null,
        updatedAt: expect.any(Date),
      }),
    );
    expect(body.state).toEqual(fakeState);
  });

  it('caps extremely long active fast durations to a sane maximum', async () => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60_000);
    mocks.mockUpdateReturning.mockResolvedValue([
      {
        protocolId: '16_8',
        activeFastStartAt: fourteenDaysAgo,
      },
    ]);

    const request = new NextRequest('http://localhost:3000/api/fastlane/session/end', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json() as {
      state: FastLaneState;
      durationMinutes: number;
      durationCapped?: boolean;
    };

    expect(response.status).toBe(200);
    expect(mocks.mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        durationMinutes: 7 * 24 * 60,
      }),
    );
    expect(body.durationMinutes).toBe(7 * 24 * 60);
    expect(body.durationCapped).toBe(true);
  });

  it('falls back to default protocol id when stored protocol is invalid', async () => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60_000);
    mocks.mockUpdateReturning.mockResolvedValue([
      {
        protocolId: 'invalid_protocol',
        activeFastStartAt: thirtyMinutesAgo,
      },
    ]);

    const request = new NextRequest('http://localhost:3000/api/fastlane/session/end', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json() as { state: FastLaneState; durationMinutes: number };

    expect(response.status).toBe(200);
    expect(mocks.mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        protocolId: '16_8',
      }),
    );
    expect(body.durationMinutes).toBeGreaterThanOrEqual(29);
    expect(body.state).toEqual(fakeState);
  });

  it('returns 500 when end flow throws unexpectedly', async () => {
    mocks.mockEnsureFastLaneUser.mockRejectedValueOnce(new Error('db offline'));

    const request = new NextRequest('http://localhost:3000/api/fastlane/session/end', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Unable to end fast/i);
  });
});
