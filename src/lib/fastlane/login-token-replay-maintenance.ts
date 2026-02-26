import { and, inArray, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fastlaneLoginTokenReplay } from '@/lib/db/schema';

const MAX_DELETE_LIMIT = 10_000;

function toPositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function parseReplayCleanupLimit(value: unknown, fallback = 1000): number | null {
  const parsed = value === undefined ? fallback : toPositiveInt(value);
  if (parsed === null) return null;
  if (parsed > MAX_DELETE_LIMIT) return null;
  return parsed;
}

export async function cleanupExpiredLoginReplayMarkers(input: {
  dryRun?: boolean;
  limit?: number;
}): Promise<{ ok: true; dryRun: boolean; scanned: number; deleted: number }> {
  const dryRun = input.dryRun === true;
  const limit = input.limit ?? 1000;
  const now = new Date();

  const expiredRows = await db
    .select({ id: fastlaneLoginTokenReplay.id })
    .from(fastlaneLoginTokenReplay)
    .where(lte(fastlaneLoginTokenReplay.expiresAt, now))
    .limit(limit);

  const expiredIds = expiredRows.map((row) => row.id);
  if (dryRun || expiredIds.length === 0) {
    return {
      ok: true,
      dryRun,
      scanned: expiredRows.length,
      deleted: 0,
    };
  }

  const deletedRows = await db
    .delete(fastlaneLoginTokenReplay)
    .where(and(inArray(fastlaneLoginTokenReplay.id, expiredIds), lte(fastlaneLoginTokenReplay.expiresAt, now)))
    .returning({ id: fastlaneLoginTokenReplay.id });

  return {
    ok: true,
    dryRun: false,
    scanned: expiredRows.length,
    deleted: deletedRows.length,
  };
}
