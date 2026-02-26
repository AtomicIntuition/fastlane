import { describe, expect, it } from 'vitest';
import { shouldWriteTelemetryPreferenceUpdate } from '@/lib/fastlane/telemetry-preference-cooldown';

describe('shouldWriteTelemetryPreferenceUpdate', () => {
  it('returns false when update happens inside cooldown window', () => {
    const allowed = shouldWriteTelemetryPreferenceUpdate({
      lastWriteAtMs: 10_000,
      nowMs: 10_500,
      cooldownMs: 750,
    });
    expect(allowed).toBe(false);
  });

  it('returns true at cooldown boundary', () => {
    const allowed = shouldWriteTelemetryPreferenceUpdate({
      lastWriteAtMs: 10_000,
      nowMs: 10_750,
      cooldownMs: 750,
    });
    expect(allowed).toBe(true);
  });

  it('returns true when clock moves backwards to avoid lockout', () => {
    const allowed = shouldWriteTelemetryPreferenceUpdate({
      lastWriteAtMs: 10_000,
      nowMs: 9_000,
      cooldownMs: 750,
    });
    expect(allowed).toBe(true);
  });

  it('returns true for invalid values to fail open', () => {
    const allowed = shouldWriteTelemetryPreferenceUpdate({
      lastWriteAtMs: Number.NaN,
      nowMs: Number.NaN,
      cooldownMs: Number.NaN,
    });
    expect(allowed).toBe(true);
  });
});
