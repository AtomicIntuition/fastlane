import type { FastSession } from './types';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export function getElapsedMinutes(startAtIso: string, now = new Date()): number {
  const start = new Date(startAtIso).getTime();
  const end = now.getTime();
  if (Number.isNaN(start) || end <= start) return 0;
  return Math.floor((end - start) / MINUTE_MS);
}

export function formatDurationMinutes(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}

export function getProgressPercent(elapsedMinutes: number, targetFastHours: number): number {
  const targetMinutes = Math.max(1, targetFastHours * 60);
  const raw = (elapsedMinutes / targetMinutes) * 100;
  return Math.max(0, Math.min(100, raw));
}

export function isConsecutiveDay(previousIso: string, currentIso: string): boolean {
  const previous = new Date(previousIso);
  const current = new Date(currentIso);

  const prevDay = Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth(), previous.getUTCDate());
  const currDay = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
  return currDay - prevDay === DAY_MS;
}

export function calculateCurrentStreak(sessions: FastSession[]): number {
  if (sessions.length === 0) return 0;

  const sorted = [...sessions].sort((a, b) => a.endAt.localeCompare(b.endAt));
  const uniqueDays: string[] = [];

  for (const session of sorted) {
    const day = session.endAt.slice(0, 10);
    if (uniqueDays.length === 0 || uniqueDays[uniqueDays.length - 1] !== day) {
      uniqueDays.push(day);
    }
  }

  if (uniqueDays.length === 0) return 0;

  let streak = 1;
  for (let i = uniqueDays.length - 1; i > 0; i--) {
    const prevIso = `${uniqueDays[i - 1]}T00:00:00.000Z`;
    const currIso = `${uniqueDays[i]}T00:00:00.000Z`;
    if (isConsecutiveDay(prevIso, currIso)) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}
