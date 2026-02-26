import { and, inArray, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fastlaneLoginRequestThrottle } from '@/lib/db/schema';

const MAX_DELETE_LIMIT = 10_000;
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 365;

function toPositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function parseThrottleCleanupLimit(value: unknown, fallback = 1000): number | null {
  const parsed = value === undefined ? fallback : toPositiveInt(value);
  if (parsed === null || parsed > MAX_DELETE_LIMIT) return null;
  return parsed;
}

export function parseThrottleRetentionDays(value: unknown, fallback = 30): number | null {
  const parsed = value === undefined ? fallback : toPositiveInt(value);
  if (parsed === null) return null;
  if (parsed < MIN_RETENTION_DAYS || parsed > MAX_RETENTION_DAYS) return null;
  return parsed;
}

export async function cleanupStaleLoginRequestThrottleRows(input: {
  dryRun?: boolean;
  limit?: number;
  retentionDays?: number;
}): Promise<{ ok: true; dryRun: boolean; scanned: number; deleted: number; retentionDays: number }> {
  const dryRun = input.dryRun === true;
  const limit = input.limit ?? 1000;
  const retentionDays = input.retentionDays ?? 30;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const staleRows = await db
    .select({ id: fastlaneLoginRequestThrottle.id })
    .from(fastlaneLoginRequestThrottle)
    .where(lte(fastlaneLoginRequestThrottle.lastRequestedAt, cutoff))
    .limit(limit);

  const staleIds = staleRows.map((row) => row.id);
  if (dryRun || staleIds.length === 0) {
    return {
      ok: true,
      dryRun,
      scanned: staleRows.length,
      deleted: 0,
      retentionDays,
    };
  }

  const deletedRows = await db
    .delete(fastlaneLoginRequestThrottle)
    .where(
      and(
        inArray(fastlaneLoginRequestThrottle.id, staleIds),
        lte(fastlaneLoginRequestThrottle.lastRequestedAt, cutoff),
      ),
    )
    .returning({ id: fastlaneLoginRequestThrottle.id });

  return {
    ok: true,
    dryRun: false,
    scanned: staleRows.length,
    deleted: deletedRows.length,
    retentionDays,
  };
}
