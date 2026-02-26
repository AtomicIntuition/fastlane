import { describe, expect, it } from 'vitest';
import { buildFastLaneNotificationPlan } from '@/lib/fastlane/notifications';
import type { FastLaneState } from '@/lib/fastlane/types';

const baseState: FastLaneState = {
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

describe('buildFastLaneNotificationPlan', () => {
  it('returns disabled plan when reminders are paused', () => {
    const plan = buildFastLaneNotificationPlan({
      state: {
        ...baseState,
        profile: { ...baseState.profile, reminders: false },
      },
      now: new Date('2026-02-26T10:00:00.000Z'),
    });

    expect(plan.enabled).toBe(false);
    expect(plan.next).toHaveLength(0);
  });

  it('returns fast progress reminders while active fast is running', () => {
    const plan = buildFastLaneNotificationPlan({
      state: {
        ...baseState,
        activeFastStartAt: '2026-02-26T08:00:00.000Z',
      },
      now: new Date('2026-02-26T12:00:00.000Z'),
      linkedAccount: true,
    });

    expect(plan.enabled).toBe(true);
    expect(plan.next.some((item) => item.id === 'fast-complete')).toBe(true);
    expect(plan.next.some((item) => item.id === 'hydration-check')).toBe(true);
    expect(plan.next.every((item) => item.channel === 'email')).toBe(true);
  });

  it('adds reengagement reminder when recent sessions are stale', () => {
    const plan = buildFastLaneNotificationPlan({
      state: {
        ...baseState,
        sessions: [
          {
            id: 'sess_1',
            startAt: '2026-02-20T07:00:00.000Z',
            endAt: '2026-02-20T23:00:00.000Z',
            durationMinutes: 960,
            protocolId: '16_8',
          },
        ],
      },
      now: new Date('2026-02-26T10:00:00.000Z'),
    });

    expect(plan.next.some((item) => item.id === 'reengagement')).toBe(true);
  });
});
