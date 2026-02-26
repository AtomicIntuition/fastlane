import { describe, expect, it } from 'vitest';
import {
  getCompactTelemetryFreshness,
  getSnapshotFreshness,
} from '@/lib/fastlane/snapshot-freshness';

describe('getSnapshotFreshness', () => {
  const now = Date.parse('2026-02-26T19:10:00.000Z');

  it('returns unknown and stale for invalid timestamps', () => {
    const result = getSnapshotFreshness('not-a-date', now);
    expect(result).toEqual({
      label: 'Data age: unknown',
      stale: true,
    });
  });

  it('returns fresh label for sub-minute data', () => {
    const result = getSnapshotFreshness('2026-02-26T19:09:45.000Z', now);
    expect(result).toEqual({
      label: 'Data age: <1 minute',
      stale: false,
    });
  });

  it('returns minute-based label and marks stale after 15 minutes', () => {
    const fresh = getSnapshotFreshness('2026-02-26T19:00:00.000Z', now);
    const stale = getSnapshotFreshness('2026-02-26T18:50:00.000Z', now);

    expect(fresh).toEqual({
      label: 'Data age: 10 minutes',
      stale: false,
    });
    expect(stale).toEqual({
      label: 'Data age: 20 minutes',
      stale: true,
    });
  });

  it('returns hour-based label and always marks as stale', () => {
    const result = getSnapshotFreshness('2026-02-26T17:10:00.000Z', now);
    expect(result).toEqual({
      label: 'Data age: 2 hours',
      stale: true,
    });
  });
});

describe('getCompactTelemetryFreshness', () => {
  const now = Date.parse('2026-02-26T19:10:00.000Z');

  it('returns stale for invalid timestamps', () => {
    const result = getCompactTelemetryFreshness('bad-date', now);
    expect(result).toEqual({ label: 'stale', stale: true });
  });

  it('returns sub-5m freshness for very recent telemetry', () => {
    const result = getCompactTelemetryFreshness('2026-02-26T19:08:15.000Z', now);
    expect(result).toEqual({ label: '<5m', stale: false });
  });

  it('returns minute freshness under one hour', () => {
    const result = getCompactTelemetryFreshness('2026-02-26T18:58:00.000Z', now);
    expect(result).toEqual({ label: '12m', stale: false });
  });

  it('returns hour freshness within 24 hours and marks stale', () => {
    const result = getCompactTelemetryFreshness('2026-02-26T06:10:00.000Z', now);
    expect(result).toEqual({ label: '13h', stale: true });
  });

  it('returns stale for telemetry older than 24 hours', () => {
    const result = getCompactTelemetryFreshness('2026-02-25T06:10:00.000Z', now);
    expect(result).toEqual({ label: 'stale', stale: true });
  });
});
