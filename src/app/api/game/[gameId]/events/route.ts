import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { games, gameEvents } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/game/[gameId]/events
 *
 * Returns all game events for a completed game as a JSON array.
 * Used by the static replay viewer so users can scroll through plays.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  const gameRows = await db
    .select({ status: games.status })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (gameRows.length === 0) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  // Only serve events for completed games (no spoilers for broadcasting)
  if (gameRows[0].status !== 'completed') {
    return NextResponse.json(
      { error: 'Game is not completed yet' },
      { status: 403 }
    );
  }

  const events = await db
    .select()
    .from(gameEvents)
    .where(eq(gameEvents.gameId, gameId))
    .orderBy(asc(gameEvents.eventNumber));

  const mapped = events.map((e) => ({
    eventNumber: e.eventNumber,
    playResult: e.playResult,
    commentary: e.commentary,
    gameState: e.gameState,
    narrativeContext: e.narrativeContext,
    timestamp: e.displayTimestamp,
    driveNumber: (e.playResult as Record<string, unknown>)?.driveNumber ?? 0,
  }));

  return NextResponse.json(mapped);
}
