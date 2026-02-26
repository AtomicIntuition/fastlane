import { describe, expect, it } from 'vitest';
import {
  calculateCurrentStreak,
  formatDurationMinutes,
  getElapsedMinutes,
  getProgressPercent,
  isConsecutiveDay,
} from '@/lib/fastlane/time';

describe('fastlane time helpers', () => {
  it('calculates elapsed minutes safely', () => {
    const start = '2026-02-25T10:00:00.000Z';
    const now = new Date('2026-02-25T12:30:00.000Z');
    expect(getElapsedMinutes(start, now)).toBe(150);
    expect(getElapsedMinutes('invalid', now)).toBe(0);
  });

  it('formats duration consistently', () => {
    expect(formatDurationMinutes(0)).toBe('0h 00m');
    expect(formatDurationMinutes(65)).toBe('1h 05m');
  });

  it('clamps progress to 0..100', () => {
    expect(getProgressPercent(120, 16)).toBeGreaterThan(0);
    expect(getProgressPercent(9999, 16)).toBe(100);
    expect(getProgressPercent(-100, 16)).toBe(0);
  });

  it('checks consecutive day boundaries', () => {
    expect(isConsecutiveDay('2026-02-24T00:00:00.000Z', '2026-02-25T00:00:00.000Z')).toBe(true);
    expect(isConsecutiveDay('2026-02-24T00:00:00.000Z', '2026-02-26T00:00:00.000Z')).toBe(false);
  });

  it('computes streak by unique completed days', () => {
    const sessions = [
      {
        id: 's1',
        startAt: '2026-02-23T08:00:00.000Z',
        endAt: '2026-02-23T18:00:00.000Z',
        durationMinutes: 600,
        protocolId: '16_8',
      },
      {
        id: 's2',
        startAt: '2026-02-24T08:00:00.000Z',
        endAt: '2026-02-24T18:00:00.000Z',
        durationMinutes: 600,
        protocolId: '16_8',
      },
      {
        id: 's3',
        startAt: '2026-02-25T08:00:00.000Z',
        endAt: '2026-02-25T18:00:00.000Z',
        durationMinutes: 600,
        protocolId: '16_8',
      },
    ];

    expect(calculateCurrentStreak(sessions)).toBe(3);

    const broken = [...sessions, {
      id: 's4',
      startAt: '2026-02-27T08:00:00.000Z',
      endAt: '2026-02-27T18:00:00.000Z',
      durationMinutes: 600,
      protocolId: '16_8',
    }];

    expect(calculateCurrentStreak(broken)).toBe(1);
  });
});
