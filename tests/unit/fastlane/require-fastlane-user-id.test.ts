import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockAccountUserId = vi.fn();
  const mockSignedUserId = vi.fn();
  return { mockAccountUserId, mockSignedUserId };
});

vi.mock('@/lib/utils/fastlane-account-session-cookie', () => ({
  getFastLaneAccountSessionUserIdFromRequest: mocks.mockAccountUserId,
}));

vi.mock('@/lib/utils/signed-cookie', () => ({
  getUserIdFromRequest: mocks.mockSignedUserId,
}));

import { requireFastLaneUserId } from '@/lib/fastlane/server';

describe('requireFastLaneUserId', () => {
  it('prefers account session user id when present', () => {
    mocks.mockAccountUserId.mockReturnValueOnce('account-user');
    mocks.mockSignedUserId.mockReturnValueOnce('guest-user');

    const result = requireFastLaneUserId({} as never);

    expect(result).toBe('account-user');
    expect(mocks.mockSignedUserId).not.toHaveBeenCalled();
  });

  it('falls back to signed guest user id when account session is missing', () => {
    mocks.mockAccountUserId.mockReturnValueOnce(null);
    mocks.mockSignedUserId.mockReturnValueOnce('guest-user');

    const result = requireFastLaneUserId({} as never);

    expect(result).toBe('guest-user');
  });
});
