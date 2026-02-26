import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastLaneState } from '@/lib/fastlane/types';

const mocks = vi.hoisted(() => {
  const mockEnsureFastLaneUser = vi.fn();
  const mockGetEffectiveFastLaneTier = vi.fn();
  const mockGetFastLaneStateForUser = vi.fn();
  const mockRequireFastLaneUserId = vi.fn();
  const mockUnauthorized = vi.fn(() =>
    NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
  );

  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

  const mockUpdateReturning = vi.fn<() => Promise<Array<{ id: string }>>>(async () => []);
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }));
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

  return {
    mockEnsureFastLaneUser,
    mockGetEffectiveFastLaneTier,
    mockGetFastLaneStateForUser,
    mockRequireFastLaneUserId,
    mockUnauthorized,
    mockSelectLimit,
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockUpdateReturning,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
  };
});

vi.mock('@/lib/fastlane/server', () => ({
  ensureFastLaneUser: mocks.mockEnsureFastLaneUser,
  getEffectiveFastLaneTier: mocks.mockGetEffectiveFastLaneTier,
  getFastLaneStateForUser: mocks.mockGetFastLaneStateForUser,
  requireFastLaneUserId: mocks.mockRequireFastLaneUserId,
  unauthorized: mocks.mockUnauthorized,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
  },
}));

import { POST } from '@/app/api/fastlane/session/start/route';

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
    firstFastCompletedTracked: false,
    postOnboardingPaywallSeen: true,
  },
};

describe('FastLane start session route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockRequireFastLaneUserId.mockReturnValue('test-user');
    mocks.mockEnsureFastLaneUser.mockResolvedValue({ tier: 'free', protocolId: '16_8' });
    mocks.mockGetEffectiveFastLaneTier.mockResolvedValue('free');
    mocks.mockGetFastLaneStateForUser.mockResolvedValue(fakeState);
    mocks.mockUpdateReturning.mockResolvedValue([{ id: 'fl_u1' }]);
    mocks.mockSelectLimit.mockResolvedValue([
      {
        userId: 'test-user',
        activeFastStartAt: null,
      },
    ]);
  });

  it('returns unauthorized when user id is missing', async () => {
    mocks.mockRequireFastLaneUserId.mockReturnValue(null);
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('rejects unknown query parameters', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start?source=widget', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects malformed json payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid JSON body/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects malformed content-length header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': 'abc' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-length header/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects oversized content-length header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '2049' },
      body: '{}',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects oversized request body', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(3000),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects non-json content-type when body is provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-type header/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('accepts json content-type with charset when body is provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown fields in payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ now: true }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown field/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 409 when a fast is already active', async () => {
    const activeStartAt = new Date('2026-02-25T12:00:00.000Z');
    mocks.mockUpdateReturning.mockResolvedValue([]);
    mocks.mockSelectLimit.mockResolvedValue([
      {
        userId: 'test-user',
        activeFastStartAt: activeStartAt,
      },
    ]);

    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/already active/i);
    expect(body.activeFastStartAt).toBe(activeStartAt.toISOString());
    expect(mocks.mockUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.mockGetFastLaneStateForUser).not.toHaveBeenCalled();
  });

  it('returns 403 when free user attempts to start premium protocol', async () => {
    mocks.mockEnsureFastLaneUser.mockResolvedValueOnce({ tier: 'free', protocolId: '20_4' });

    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/Upgrade required/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 403 for premium protocol when cached tier is pro but effective tier is free', async () => {
    mocks.mockEnsureFastLaneUser.mockResolvedValueOnce({ tier: 'pro', protocolId: '20_4' });
    mocks.mockGetEffectiveFastLaneTier.mockResolvedValueOnce('free');

    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/Upgrade required/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('fails closed for premium protocol when effective tier lookup throws', async () => {
    mocks.mockEnsureFastLaneUser.mockResolvedValueOnce({ tier: 'pro', protocolId: '20_4' });
    mocks.mockGetEffectiveFastLaneTier.mockRejectedValueOnce(new Error('db unavailable'));

    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/Upgrade required/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('allows premium protocol when effective subscription tier is pro', async () => {
    mocks.mockEnsureFastLaneUser.mockResolvedValueOnce({ tier: 'free', protocolId: '20_4' });
    mocks.mockGetEffectiveFastLaneTier.mockResolvedValueOnce('pro');

    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when user has invalid stored protocol', async () => {
    mocks.mockEnsureFastLaneUser.mockResolvedValueOnce({ tier: 'free', protocolId: 'invalid_protocol' });

    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid stored protocol/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('starts a fast when no active session exists', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json() as { state: FastLaneState };

    expect(response.status).toBe(200);
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        activeFastStartAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
    expect(body.state).toEqual(fakeState);
  });

  it('returns 500 when atomic start fails and no active fast is found', async () => {
    mocks.mockUpdateReturning.mockResolvedValue([]);
    mocks.mockSelectLimit.mockResolvedValue([{ userId: 'test-user', activeFastStartAt: null }]);

    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Unable to start fast/i);
  });

  it('returns 500 when start flow throws unexpectedly', async () => {
    mocks.mockEnsureFastLaneUser.mockRejectedValueOnce(new Error('db offline'));

    const request = new NextRequest('http://localhost:3000/api/fastlane/session/start', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Unable to start fast/i);
  });
});
