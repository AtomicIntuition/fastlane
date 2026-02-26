export interface SnapshotFreshness {
  label: string;
  stale: boolean;
}

export interface CompactFreshness {
  label: string;
  stale: boolean;
}

export function getSnapshotFreshness(
  isoTimestamp: string,
  nowMs: number = Date.now(),
): SnapshotFreshness {
  const ageMs = nowMs - new Date(isoTimestamp).getTime();

  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return { label: 'Data age: unknown', stale: true };
  }

  const ageMinutes = Math.floor(ageMs / 60000);
  if (ageMinutes < 1) {
    return { label: 'Data age: <1 minute', stale: false };
  }
  if (ageMinutes < 60) {
    return {
      label: `Data age: ${ageMinutes} minute${ageMinutes === 1 ? '' : 's'}`,
      stale: ageMinutes > 15,
    };
  }

  const ageHours = Math.floor(ageMinutes / 60);
  return {
    label: `Data age: ${ageHours} hour${ageHours === 1 ? '' : 's'}`,
    stale: true,
  };
}

export function getCompactTelemetryFreshness(
  isoTimestamp: string,
  nowMs: number = Date.now(),
): CompactFreshness {
  const ageMs = nowMs - new Date(isoTimestamp).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return { label: 'stale', stale: true };
  }

  const ageMinutes = Math.floor(ageMs / 60000);
  if (ageMinutes < 5) {
    return { label: '<5m', stale: false };
  }
  if (ageMinutes < 60) {
    return { label: `${ageMinutes}m`, stale: false };
  }

  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) {
    return { label: `${ageHours}h`, stale: true };
  }
  return { label: 'stale', stale: true };
}
