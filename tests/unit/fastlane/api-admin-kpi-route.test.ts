import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockIsAdminAuthorized = vi.fn();

  const mockGroupBy = vi.fn<(...args: unknown[]) => Promise<Array<{ eventName: string; count: number }>>>(
    async () => [],
  );
  const mockWhereForTotals = vi.fn(() => ({ groupBy: mockGroupBy }));

  const mockLimit = vi.fn<(...args: unknown[]) => Promise<Array<{ uniqueUsers: number }>>>(
    async () => [{ uniqueUsers: 0 }],
  );
  const mockWhereForUsers = vi.fn(() => ({ limit: mockLimit }));
  const mockAccountLimit = vi.fn<
    (...args: unknown[]) => Promise<Array<{ totalUsers: number; linkedUsers: number }>>
  >(async () => [{ totalUsers: 0, linkedUsers: 0 }]);

  let selectCount = 0;
  const mockSelect = vi.fn(() => {
    selectCount += 1;
    if (selectCount === 1) {
      return { from: vi.fn(() => ({ where: mockWhereForTotals })) };
    }
    if (selectCount === 2) {
      return { from: vi.fn(() => ({ where: mockWhereForUsers })) };
    }
    return { from: vi.fn(() => ({ limit: mockAccountLimit })) };
  });

  const resetSelectCount = () => {
    selectCount = 0;
  };

  return {
    mockIsAdminAuthorized,
    mockSelect,
    mockGroupBy,
    mockWhereForTotals,
    mockLimit,
    mockWhereForUsers,
    mockAccountLimit,
    resetSelectCount,
  };
});

vi.mock('@/lib/utils/admin-session-cookie', () => ({
  isAdminAuthorized: mocks.mockIsAdminAuthorized,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.mockSelect,
  },
}));

import { GET } from '@/app/api/admin/fastlane/kpi/route';

describe('FastLane admin KPI route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetSelectCount();
    mocks.mockIsAdminAuthorized.mockReturnValue(true);
  });

  it('returns unauthorized for non-admin requests', async () => {
    mocks.mockIsAdminAuthorized.mockReturnValue(false);

    const response = await GET(new NextRequest('http://localhost:3000/api/admin/fastlane/kpi'));
    expect(response.status).toBe(401);
  });

  it('rejects unknown query parameters', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/admin/fastlane/kpi?foo=bar'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
  });

  it('rejects invalid days values', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/admin/fastlane/kpi?days=0'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid days/i);
  });

  it('returns KPI response for valid requests', async () => {
    mocks.mockGroupBy.mockResolvedValueOnce([
      { eventName: 'landing_cta_clicked', count: 100 },
      { eventName: 'signup_started', count: 80 },
      { eventName: 'onboarding_completed', count: 60 },
      { eventName: 'first_fast_started', count: 48 },
      { eventName: 'first_fast_completed', count: 36 },
      { eventName: 'trial_started', count: 12 },
      { eventName: 'paywall_viewed', count: 50 },
    ]);
    mocks.mockLimit.mockResolvedValueOnce([{ uniqueUsers: 77 }]);
    mocks.mockAccountLimit.mockResolvedValueOnce([{ totalUsers: 40, linkedUsers: 30 }]);

    const response = await GET(new NextRequest('http://localhost:3000/api/admin/fastlane/kpi?days=30'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(body.windowDays).toBe(30);
    expect(body.totals.uniqueUsers).toBe(77);
    expect(body.funnel.counts.trial_started).toBe(12);
    expect(body.monetization.paywallToTrialRate).toBe(24);
    expect(body.auth.totalUsers).toBe(40);
    expect(body.auth.linkedUsers).toBe(30);
    expect(body.auth.linkedUserRate).toBe(75);
    expect(Array.isArray(body.topEvents)).toBe(true);
  });
});
