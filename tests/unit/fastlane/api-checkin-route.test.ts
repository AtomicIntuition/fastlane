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

  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

  const mockInsertValues = vi.fn(async () => []);
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

  const mockUpdateWhere = vi.fn(async () => []);
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

  return {
    mockEnsureFastLaneUser,
    mockGetFastLaneStateForUser,
    mockRequireFastLaneUserId,
    mockUnauthorized,
    mockSelectLimit,
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockInsertValues,
    mockInsert,
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
    select: mocks.mockSelect,
    insert: mocks.mockInsert,
    update: mocks.mockUpdate,
  },
}));

import { POST } from '@/app/api/fastlane/checkin/route';

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

describe('FastLane checkin route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockRequireFastLaneUserId.mockReturnValue('test-user');
    mocks.mockEnsureFastLaneUser.mockResolvedValue(undefined);
    mocks.mockGetFastLaneStateForUser.mockResolvedValue(fakeState);
    mocks.mockSelectLimit.mockResolvedValue([]);
  });

  it('returns unauthorized when user id is missing', async () => {
    mocks.mockRequireFastLaneUserId.mockReturnValue(null);

    const request = new NextRequest('http://localhost:3000/api/fastlane/checkin', {
      method: 'POST',
      body: JSON.stringify({ energy: 4, hunger: 3, mood: 5 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('rejects unknown query parameters', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/checkin?source=widget', {
      method: 'POST',
      body: JSON.stringify({ energy: 4, hunger: 3, mood: 5 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid check-in values', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/checkin', {
      method: 'POST',
      body: JSON.stringify({ energy: 10, hunger: 3, mood: 5 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/must be 1-5/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
  });

  it('rejects non-json content-type header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/checkin', {
      method: 'POST',
      body: JSON.stringify({ energy: 4, hunger: 3, mood: 5 }),
      headers: { 'content-type': 'text/plain' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-type header/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('accepts json content-type with charset', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/checkin', {
      method: 'POST',
      body: JSON.stringify({ energy: 4, hunger: 3, mood: 5 }),
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.mockInsertValues).toHaveBeenCalledTimes(1);
  });

  it('rejects non-integer check-in values', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/checkin', {
      method: 'POST',
      body: JSON.stringify({ energy: 4.5, hunger: 3, mood: 5 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/must be 1-5/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects non-object json payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/checkin', {
      method: 'POST',
      body: JSON.stringify([]),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid JSON body/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects malformed content-length header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/checkin', {
      method: 'POST',
      body: JSON.stringify({ energy: 4, hunger: 3, mood: 5 }),
      headers: {
        'content-type': 'application/json',
        'content-length': 'abc',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-length header/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects oversized content-length header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/checkin', {
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
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects oversized request body', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/checkin', {
      method: 'POST',
      body: 'x'.repeat(5000),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects empty check-in payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/checkin', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/No check-in values provided/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects unknown fields in check-in payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/checkin', {
      method: 'POST',
      body: JSON.stringify({ energy: 4, hunger: 3, mood: 5, note: 'extra' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown field/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('inserts a new check-in when no check-in exists for current utc day', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/checkin', {
      method: 'POST',
      body: JSON.stringify({ energy: 4, hunger: 3, mood: 5 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json() as { state: FastLaneState };

    expect(response.status).toBe(200);
    expect(mocks.mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'test-user',
        energy: 4,
        hunger: 3,
        mood: 5,
        loggedAt: expect.any(Date),
      }),
    );
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
    expect(body.state).toEqual(fakeState);
  });

  it('updates existing check-in for current utc day', async () => {
    mocks.mockSelectLimit.mockResolvedValue([{ id: 'ci_today_1' }]);

    const request = new NextRequest('http://localhost:3000/api/fastlane/checkin', {
      method: 'POST',
      body: JSON.stringify({ energy: 2, hunger: 4, mood: 3 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json() as { state: FastLaneState };

    expect(response.status).toBe(200);
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        energy: 2,
        hunger: 4,
        mood: 3,
        loggedAt: expect.any(Date),
      }),
    );
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(body.state).toEqual(fakeState);
  });

  it('returns 500 when check-in flow throws unexpectedly', async () => {
    mocks.mockEnsureFastLaneUser.mockRejectedValueOnce(new Error('db offline'));

    const request = new NextRequest('http://localhost:3000/api/fastlane/checkin', {
      method: 'POST',
      body: JSON.stringify({ energy: 4, hunger: 3, mood: 5 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Unable to save check-in/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });
});
