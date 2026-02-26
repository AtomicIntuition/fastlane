export function shouldWriteTelemetryPreferenceUpdate(params: {
  lastWriteAtMs: number;
  nowMs: number;
  cooldownMs: number;
}): boolean {
  const { lastWriteAtMs, nowMs, cooldownMs } = params;
  if (!Number.isFinite(nowMs) || !Number.isFinite(lastWriteAtMs) || !Number.isFinite(cooldownMs)) {
    return true;
  }
  if (cooldownMs <= 0) return true;
  if (nowMs < lastWriteAtMs) return true;
  return nowMs - lastWriteAtMs >= cooldownMs;
}
