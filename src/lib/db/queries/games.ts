import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getTeamMap } from "./teams";

/** Get a game by ID with team data */
export async function getGameById(gameId: string) {
  const result = await db
    .select()
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (result.length === 0) return null;

  const game = result[0];
  const teamMap = await getTeamMap();

  return {
    ...game,
    homeTeam: teamMap.get(game.homeTeamId) ?? null,
    awayTeam: teamMap.get(game.awayTeamId) ?? null,
  };
}

/** Get the current live game (broadcasting status) */
export async function getCurrentGame() {
  const result = await db
    .select()
    .from(games)
    .where(eq(games.status, "broadcasting"))
    .limit(1);

  if (result.length === 0) return null;
  return getGameById(result[0].id);
}

/** Get the next scheduled game */
export async function getNextScheduledGame() {
  const result = await db
    .select()
    .from(games)
    .where(
      and(eq(games.status, "scheduled"), eq(games.isFeatured, true))
    )
    .limit(1);

  if (result.length === 0) {
    // No featured scheduled, get any scheduled
    const any = await db
      .select()
      .from(games)
      .where(eq(games.status, "scheduled"))
      .limit(1);
    if (any.length === 0) return null;
    return getGameById(any[0].id);
  }

  return getGameById(result[0].id);
}

/** Get all games for a season week */
export async function getGamesByWeek(seasonId: string, week: number) {
  const result = await db
    .select()
    .from(games)
    .where(and(eq(games.seasonId, seasonId), eq(games.week, week)));

  // Hydrate with team data (cached)
  const teamMap = await getTeamMap();

  return result.map((g) => ({
    ...g,
    homeTeam: teamMap.get(g.homeTeamId) ?? null,
    awayTeam: teamMap.get(g.awayTeamId) ?? null,
  }));
}

/** Get all completed games for a team in a season */
export async function getTeamGames(seasonId: string, teamId: string) {
  const result = await db
    .select()
    .from(games)
    .where(eq(games.seasonId, seasonId));

  const teamGames = result.filter(
    (g) => g.homeTeamId === teamId || g.awayTeamId === teamId
  );

  const teamMap = await getTeamMap();

  return teamGames.map((g) => ({
    ...g,
    homeTeam: teamMap.get(g.homeTeamId) ?? null,
    awayTeam: teamMap.get(g.awayTeamId) ?? null,
  }));
}

/** Update a game's status and scores */
export async function updateGame(
  gameId: string,
  data: Partial<{
    status: "scheduled" | "simulating" | "broadcasting" | "completed";
    homeScore: number;
    awayScore: number;
    isFeatured: boolean;
    serverSeed: string;
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
    totalPlays: number;
    mvpPlayerId: string;
    boxScore: unknown;
    broadcastStartedAt: Date;
    completedAt: Date;
  }>
) {
  await db.update(games).set(data).where(eq(games.id, gameId));
}

/** Get recently completed games */
export async function getRecentGames(limit: number = 10) {
  return db
    .select()
    .from(games)
    .where(eq(games.status, "completed"))
    .orderBy(desc(games.completedAt))
    .limit(limit);
}
