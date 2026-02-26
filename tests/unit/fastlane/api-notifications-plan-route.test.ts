import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastLaneState } from '@/lib/fastlane/types';

const mocks = vi.hoisted(() => {
  const mockRequireFastLaneUserId = vi.fn();
  const mockUnauthorized = vi.fn(() =>
    NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
  );
  const mockGetFastLaneStateForUser = vi.fn();
  const mockEnsureFastLaneUser = vi.fn();
  return {
    mockRequireFastLaneUserId,
    mockUnauthorized,
    mockGetFastLaneStateForUser,
    mockEnsureFastLaneUser,
  };
});

vi.mock('@/lib/fastlane/server', () => ({
  requireFastLaneUserId: mocks.mockRequireFastLaneUserId,
  unauthorized: mocks.mockUnauthorized,
  getFastLaneStateForUser: mocks.mockGetFastLaneStateForUser,
  ensureFastLaneUser: mocks.mockEnsureFastLaneUser,
}));

import { GET } from '@/app/api/fastlane/notifications/plan/route';

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

describe('FastLane notifications plan route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockRequireFastLaneUserId.mockReturnValue('test-user');
    mocks.mockGetFastLaneStateForUser.mockResolvedValue(fakeState);
    mocks.mockEnsureFastLaneUser.mockResolvedValue({ userId: 'test-user', email: null });
  });

  it('returns unauthorized when user id is missing', async () => {
    mocks.mockRequireFastLaneUserId.mockReturnValue(null);
    const response = await GET(new NextRequest('http://localhost:3000/api/fastlane/notifications/plan'));

    expect(response.status).toBe(401);
    expect(mocks.mockUnauthorized).toHaveBeenCalled();
  });

  it('rejects unknown query parameters', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/fastlane/notifications/plan?foo=bar'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
  });

  it('returns notification plan with no-store cache headers', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/fastlane/notifications/plan'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(body.enabled).toBe(true);
    expect(Array.isArray(body.next)).toBe(true);
  });
});
