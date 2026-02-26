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

  const mockUpdateWhere = vi.fn(async () => []);
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));
  const mockHasValidFastLaneCsrfRequest = vi.fn(() => true);

  return {
    mockEnsureFastLaneUser,
    mockGetEffectiveFastLaneTier,
    mockGetFastLaneStateForUser,
    mockRequireFastLaneUserId,
    mockUnauthorized,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
    mockHasValidFastLaneCsrfRequest,
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
    update: mocks.mockUpdate,
  },
}));

vi.mock('@/lib/utils/fastlane-csrf', () => ({
  hasValidFastLaneCsrfRequest: mocks.mockHasValidFastLaneCsrfRequest,
}));

import { GET, PUT } from '@/app/api/fastlane/state/route';

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
    firstFastStartedTracked: false,
    firstFastCompletedTracked: false,
    postOnboardingPaywallSeen: false,
  },
};

describe('FastLane state route', () => {
  const currentVersion = '2026-02-26T00:00:00.000Z';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockRequireFastLaneUserId.mockReturnValue('test-user');
    mocks.mockEnsureFastLaneUser.mockResolvedValue({ tier: 'free', updatedAt: new Date(currentVersion) });
    mocks.mockGetEffectiveFastLaneTier.mockResolvedValue('free');
    mocks.mockGetFastLaneStateForUser.mockResolvedValue(fakeState);
    mocks.mockHasValidFastLaneCsrfRequest.mockReturnValue(true);
  });

  it('returns unauthorized when no user id is present', async () => {
    mocks.mockRequireFastLaneUserId.mockReturnValue(null);
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({ goal: 'energy' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request);

    expect(response.status).toBe(401);
    expect(mocks.mockUnauthorized).toHaveBeenCalled();
  });

  it('rejects unknown query parameters on GET', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state?view=compact', {
      method: 'GET',
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
    expect(mocks.mockGetFastLaneStateForUser).not.toHaveBeenCalled();
  });

  it('returns state version in GET response body and header', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'GET',
    });

    const response = await GET(request);
    const body = (await response.json()) as { state: FastLaneState; stateVersion: string };

    expect(response.status).toBe(200);
    expect(body.state).toEqual(fakeState);
    expect(body.stateVersion).toBe(currentVersion);
    expect(response.headers.get('x-fastlane-state-version')).toBe(currentVersion);
  });

  it('rejects invalid goal payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({ goal: 'not-a-goal' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid goal/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects unknown query parameters on PUT', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state?view=compact', {
      method: 'PUT',
      body: JSON.stringify({ goal: 'energy' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects non-object json payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify([]),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid JSON body/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid state version headers on PUT', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({ goal: 'energy' }),
      headers: {
        'content-type': 'application/json',
        'x-fastlane-state-version': 'not-a-date',
      },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid state version header/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 403 when csrf validation fails on PUT', async () => {
    mocks.mockHasValidFastLaneCsrfRequest.mockReturnValueOnce(false);
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({ goal: 'energy' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/CSRF validation failed/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 409 and latest state when provided state version is stale', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({ goal: 'metabolic' }),
      headers: {
        'content-type': 'application/json',
        'x-fastlane-state-version': '2026-02-25T00:00:00.000Z',
      },
    });

    const response = await PUT(request);
    const body = (await response.json()) as { error: string; state: FastLaneState; stateVersion: string };

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/State conflict/i);
    expect(body.state).toEqual(fakeState);
    expect(body.stateVersion).toBe(currentVersion);
    expect(response.headers.get('x-fastlane-state-version')).toBe(currentVersion);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects malformed content-length header on PUT', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({ goal: 'energy' }),
      headers: {
        'content-type': 'application/json',
        'content-length': 'abc',
      },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-length header/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects oversized content-length header on PUT', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: '{}',
      headers: {
        'content-type': 'application/json',
        'content-length': '8193',
      },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects oversized request body on PUT', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: 'x'.repeat(9000),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/Payload too large/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects non-json content-type on PUT', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({ goal: 'energy' }),
      headers: { 'content-type': 'text/plain' },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-type header/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('accepts json content-type with charset on PUT', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({ goal: 'metabolic' }),
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });

    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(mocks.mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('rejects empty update payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/No updates provided/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects unknown fields in update payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({ unexpectedField: true }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown field/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects unknown protocol id values', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({ protocolId: 'not-a-protocol' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid protocolId/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects premium protocols for free users', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({ protocolId: '20_4' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/Upgrade required/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects premium protocols when cached tier is pro but effective tier is free', async () => {
    mocks.mockEnsureFastLaneUser.mockResolvedValueOnce({ tier: 'pro' });
    mocks.mockGetEffectiveFastLaneTier.mockResolvedValueOnce('free');

    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({ protocolId: '20_4' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/Upgrade required/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('fails closed for premium protocols when effective tier lookup throws', async () => {
    mocks.mockEnsureFastLaneUser.mockResolvedValueOnce({ tier: 'pro' });
    mocks.mockGetEffectiveFastLaneTier.mockRejectedValueOnce(new Error('db unavailable'));

    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({ protocolId: '20_4' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/Upgrade required/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('allows premium protocols when effective subscription tier is pro', async () => {
    mocks.mockGetEffectiveFastLaneTier.mockResolvedValueOnce('pro');

    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({ protocolId: '20_4' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(mocks.mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('updates profile fields and returns latest state', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({
        goal: 'metabolic',
        experience: 'advanced',
        protocolId: '14_10',
        wakeTime: '06:30',
        sleepTime: '22:15',
        reminders: false,
        onboarded: true,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request);
    const body = await response.json() as { state: FastLaneState };

    expect(response.status).toBe(200);
    expect(mocks.mockEnsureFastLaneUser).toHaveBeenCalledWith('test-user');
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: 'metabolic',
        experience: 'advanced',
        protocolId: '14_10',
        wakeTime: '06:30',
        sleepTime: '22:15',
        reminders: false,
        onboarded: true,
        updatedAt: expect.any(Date),
      }),
    );
    expect(body.state).toEqual(fakeState);
  });

  it('rejects invalid time-of-day payload values', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({
        wakeTime: '99:99',
        sleepTime: '24:00',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid wakeTime/i);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 500 when state read throws unexpectedly', async () => {
    mocks.mockGetFastLaneStateForUser.mockRejectedValueOnce(new Error('db offline'));

    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'GET',
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Unable to load state/i);
  });

  it('returns 500 when state update throws unexpectedly', async () => {
    mocks.mockEnsureFastLaneUser.mockRejectedValueOnce(new Error('db offline'));

    const request = new NextRequest('http://localhost:3000/api/fastlane/state', {
      method: 'PUT',
      body: JSON.stringify({ goal: 'energy' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Unable to update state/i);
  });
});
