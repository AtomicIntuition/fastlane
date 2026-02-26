import { createHash } from 'crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fastlaneLoginTokenReplay } from '@/lib/db/schema';

function tokenKey(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 32);
}

export async function isConsumedLoginToken(token: string, nowMs = Date.now()): Promise<boolean> {
  const rows = await db
    .select({ id: fastlaneLoginTokenReplay.id })
    .from(fastlaneLoginTokenReplay)
    .where(
      and(
        eq(fastlaneLoginTokenReplay.tokenHash, tokenKey(token)),
        gt(fastlaneLoginTokenReplay.expiresAt, new Date(nowMs)),
      ),
    )
    .limit(1);
  return Boolean(rows[0]?.id);
}

export async function markLoginTokenConsumed(token: string, expiresAtMs: number): Promise<boolean> {
  const inserted = await db
    .insert(fastlaneLoginTokenReplay)
    .values({
      tokenHash: tokenKey(token),
      expiresAt: new Date(expiresAtMs),
    })
    .onConflictDoNothing({ target: fastlaneLoginTokenReplay.tokenHash })
    .returning({ id: fastlaneLoginTokenReplay.id });
  return inserted.length > 0;
}
