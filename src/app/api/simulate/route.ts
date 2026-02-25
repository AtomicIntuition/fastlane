export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  games,
  seasons,
  teams,
  gameEvents,
  standings,
  predictions,
} from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { INTERMISSION_MS, WEEK_BREAK_MS, OFFSEASON_MS } from '@/lib/scheduling/constants';
import { scorePredictions } from '@/lib/db/queries/predictions';
import { updateUserScore } from '@/lib/db/queries/leaderboard';
import { projectFutureGameTimes } from '@/lib/scheduling/game-time-projector';
import { pickBestFeaturedGame } from '@/lib/simulation/featured-game-picker';
import { handleCreateSeason, handleSeasonComplete } from '@/lib/simulation/season-manager';
import { handleStartGame } from '@/lib/simulation/game-manager';
import { handleAdvanceWeek } from '@/lib/simulation/week-manager';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minute timeout for simulation

/**
 * POST /api/simulate
 *
 * Cron-triggered endpoint that advances the simulation.
 * Verifies CRON_SECRET before executing any action.
 *
 * Actions determined by current season state:
 *   - create_season: No active season exists, generate a new one
 *   - start_game: Simulate the next featured game, store events, begin broadcast
 *   - advance_week: All games this week done, move to next week
 *   - season_complete: Super Bowl played, finalize season
 *   - idle: Nothing to do right now
 */
// Vercel Cron sends GET requests with Authorization: Bearer <CRON_SECRET>
export async function GET(request: NextRequest) {
  return handleSimulate(request);
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return handleSimulate(request);
}

async function handleSimulate(request: NextRequest) {
  // ---- Verify cron secret ----
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const action = await determineNextAction();

    switch (action.type) {
      case 'create_season': {
        const result = await handleCreateSeason();
        return NextResponse.json({
          action: 'create_season',
          ...result,
        });
      }

      case 'start_game': {
        const result = await handleStartGame(action.seasonId, action.gameId);
        return NextResponse.json({
          action: 'start_game',
          ...result,
        });
      }

      case 'advance_week': {
        const result = await handleAdvanceWeek(action.seasonId);
        return NextResponse.json({
          action: 'advance_week',
          ...result,
        });
      }

      case 'season_complete': {
        const result = await handleSeasonComplete(action.seasonId);
        return NextResponse.json({
          action: 'season_complete',
          ...result,
        });
      }

      case 'idle':
      default:
        return NextResponse.json({
          action: 'idle',
          message: action.message ?? 'Nothing to do',
        });
    }
  } catch (error) {
    console.error('Simulation error:', error);
    return NextResponse.json(
      { error: 'Simulation failed', details: String(error) },
      { status: 500 }
    );
  }
}

// ============================================================
// Action determination
// ============================================================

type SimAction =
  | { type: 'create_season' }
  | { type: 'start_game'; seasonId: string; gameId: string }
  | { type: 'advance_week'; seasonId: string }
  | { type: 'season_complete'; seasonId: string }
  | { type: 'idle'; message: string };

async function determineNextAction(): Promise<SimAction> {
  // Find the latest season
  const seasonRows = await db
    .select()
    .from(seasons)
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);

  // No season exists -- create one
  if (seasonRows.length === 0) {
    return { type: 'create_season' };
  }

  const season = seasonRows[0];

  // Season is completed -- check if we should start a new one
  if (season.status === 'offseason') {
    // Check if enough time has passed since completion
    if (season.completedAt) {
      const timeSinceComplete = Date.now() - new Date(season.completedAt).getTime();
      if (timeSinceComplete >= OFFSEASON_MS) {
        return { type: 'create_season' };
      }
    }
    return { type: 'idle', message: 'Offseason - waiting for next season' };
  }

  // Get all games for the current week
  const weekGames = await db
    .select()
    .from(games)
    .where(
      and(
        eq(games.seasonId, season.id),
        eq(games.week, season.currentWeek)
      )
    );

  // Check if any game is currently broadcasting or simulating
  const activeGame = weekGames.find(
    (g) => g.status === 'broadcasting' || g.status === 'simulating'
  );

  if (activeGame) {
    if (activeGame.status === 'broadcasting' && activeGame.broadcastStartedAt) {
      const broadcastDuration = Date.now() - new Date(activeGame.broadcastStartedAt).getTime();

      // Query actual game event duration instead of using a fixed minimum
      const lastEvent = await db
        .select()
        .from(gameEvents)
        .where(eq(gameEvents.gameId, activeGame.id))
        .orderBy(desc(gameEvents.displayTimestamp))
        .limit(1);
      const gameDurationMs = lastEvent[0]?.displayTimestamp ?? 0;
      const MIN_BROADCAST = gameDurationMs + 60_000; // full event stream + 60s buffer

      if (broadcastDuration >= MIN_BROADCAST) {
        // Broadcast duration met — complete the game and update standings
        // Use AND status='broadcasting' to prevent double-completion from concurrent ticks
        const updateResult = await db
          .update(games)
          .set({ status: 'completed', completedAt: new Date() })
          .where(and(eq(games.id, activeGame.id), eq(games.status, 'broadcasting')));

        // If no rows were updated, the game was already completed by another tick
        if (updateResult.length === 0) {
          return { type: 'idle', message: 'Game already completed by another tick' };
        }

        // Update standings now that the game is officially complete
        const [ht, at] = await Promise.all([
          db.select().from(teams).where(eq(teams.id, activeGame.homeTeamId)).limit(1),
          db.select().from(teams).where(eq(teams.id, activeGame.awayTeamId)).limit(1),
        ]);
        if (ht[0] && at[0]) {
          await updateStandings(
            season.id,
            ht[0],
            at[0],
            activeGame.homeScore ?? 0,
            activeGame.awayScore ?? 0
          );
        }

        // Score predictions for this completed game
        const homeScore = activeGame.homeScore ?? 0;
        const awayScore = activeGame.awayScore ?? 0;
        const winnerId = homeScore >= awayScore ? activeGame.homeTeamId : activeGame.awayTeamId;
        try {
          await scorePredictions(activeGame.id, winnerId, homeScore, awayScore);
          // Update each predictor's leaderboard score
          const gamePreds = await db
            .select()
            .from(predictions)
            .where(eq(predictions.gameId, activeGame.id));
          for (const pred of gamePreds) {
            await updateUserScore(
              pred.userId,
              pred.pointsEarned ?? 0,
              pred.result === 'won',
            );
          }
        } catch (e) {
          console.error('Failed to score predictions:', e);
        }

        // Re-project future game times from this completion point
        await projectFutureGameTimes(season.id);

        // Fall through to find next action
      } else {
        return { type: 'idle', message: 'Game currently broadcasting' };
      }
    } else {
      return { type: 'idle', message: 'Game currently being simulated' };
    }
  }

  // ---- Intermission: pause after a broadcast finishes before next game ----

  const lastCompleted = weekGames
    .filter((g) => g.status === 'completed' && g.completedAt)
    .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0];

  // Only pause between games if there are still more games to play
  const scheduledGames = weekGames.filter((g) => g.status === 'scheduled');

  if (lastCompleted?.completedAt && scheduledGames.length > 0) {
    const elapsed = Date.now() - lastCompleted.completedAt.getTime();
    if (elapsed < INTERMISSION_MS) {
      return {
        type: 'idle',
        message: `Intermission — next game in ${Math.ceil((INTERMISSION_MS - elapsed) / 60000)} min`,
      };
    }
  }

  // Re-query week games from DB to get freshest state (guards against concurrent requests)
  const freshWeekGames = await db
    .select()
    .from(games)
    .where(
      and(
        eq(games.seasonId, season.id),
        eq(games.week, season.currentWeek)
      )
    );

  // Check if there's a game already marked as featured and scheduled
  const featuredGame = freshWeekGames.find(
    (g) => g.isFeatured && g.status === 'scheduled'
  );

  if (featuredGame) {
    return {
      type: 'start_game',
      seasonId: season.id,
      gameId: featuredGame.id,
    };
  }

  // Pick the next game to play from remaining scheduled games
  const freshScheduled = freshWeekGames.filter((g) => g.status === 'scheduled');
  if (freshScheduled.length > 0) {
    const bestGameId = await pickBestFeaturedGame(
      freshScheduled, season.id, season.currentWeek
    );
    await db
      .update(games)
      .set({ isFeatured: true })
      .where(eq(games.id, bestGameId));

    return {
      type: 'start_game',
      seasonId: season.id,
      gameId: bestGameId,
    };
  }

  // All games this week are completed
  const allCompleted = weekGames.every((g) => g.status === 'completed');

  if (allCompleted && weekGames.length > 0) {
    // Check if this is the last week of the season phase
    const isPlayoffEnd =
      season.status === 'super_bowl' && allCompleted;

    if (isPlayoffEnd) {
      return { type: 'season_complete', seasonId: season.id };
    }

    // ---- Inter-week break: 30 min pause before advancing to next week ----
    const lastCompletedGame = weekGames
      .filter((g) => g.completedAt)
      .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0];

    if (lastCompletedGame?.completedAt) {
      const elapsed = Date.now() - lastCompletedGame.completedAt.getTime();
      if (elapsed < WEEK_BREAK_MS) {
        const minsLeft = Math.ceil((WEEK_BREAK_MS - elapsed) / 60000);
        return {
          type: 'idle',
          message: `Week ${season.currentWeek} complete — next week in ${minsLeft} min`,
        };
      }
    }

    return { type: 'advance_week', seasonId: season.id };
  }

  return { type: 'idle', message: 'Waiting for games to be scheduled' };
}

// ============================================================
// Helper: Update standings after a game
// ============================================================

async function updateStandings(
  seasonId: string,
  homeTeam: typeof teams.$inferSelect,
  awayTeam: typeof teams.$inferSelect,
  homeScore: number,
  awayScore: number
) {
  const homeWon = homeScore > awayScore;
  const tie = homeScore === awayScore;
  const sameDivision =
    homeTeam.conference === awayTeam.conference &&
    homeTeam.division === awayTeam.division;
  const sameConference = homeTeam.conference === awayTeam.conference;

  // Update home team standings
  const homeStandingRows = await db
    .select()
    .from(standings)
    .where(
      and(
        eq(standings.seasonId, seasonId),
        eq(standings.teamId, homeTeam.id)
      )
    )
    .limit(1);

  if (homeStandingRows.length > 0) {
    const hs = homeStandingRows[0];
    await db
      .update(standings)
      .set({
        wins: (hs.wins ?? 0) + (homeWon ? 1 : 0),
        losses: (hs.losses ?? 0) + (!homeWon && !tie ? 1 : 0),
        ties: (hs.ties ?? 0) + (tie ? 1 : 0),
        divisionWins:
          (hs.divisionWins ?? 0) + (sameDivision && homeWon ? 1 : 0),
        divisionLosses:
          (hs.divisionLosses ?? 0) +
          (sameDivision && !homeWon && !tie ? 1 : 0),
        conferenceWins:
          (hs.conferenceWins ?? 0) + (sameConference && homeWon ? 1 : 0),
        conferenceLosses:
          (hs.conferenceLosses ?? 0) +
          (sameConference && !homeWon && !tie ? 1 : 0),
        pointsFor: (hs.pointsFor ?? 0) + homeScore,
        pointsAgainst: (hs.pointsAgainst ?? 0) + awayScore,
        streak: homeWon
          ? `W${parseInt((hs.streak ?? 'W0').replace(/[WL]/, '')) + (hs.streak?.startsWith('W') ? 1 : 1)}`
          : tie
            ? hs.streak
            : `L${parseInt((hs.streak ?? 'L0').replace(/[WL]/, '')) + (hs.streak?.startsWith('L') ? 1 : 1)}`,
      })
      .where(eq(standings.id, hs.id));
  }

  // Update away team standings
  const awayStandingRows = await db
    .select()
    .from(standings)
    .where(
      and(
        eq(standings.seasonId, seasonId),
        eq(standings.teamId, awayTeam.id)
      )
    )
    .limit(1);

  if (awayStandingRows.length > 0) {
    const as_ = awayStandingRows[0];
    const awayWon = !homeWon && !tie;
    await db
      .update(standings)
      .set({
        wins: (as_.wins ?? 0) + (awayWon ? 1 : 0),
        losses: (as_.losses ?? 0) + (homeWon ? 1 : 0),
        ties: (as_.ties ?? 0) + (tie ? 1 : 0),
        divisionWins:
          (as_.divisionWins ?? 0) + (sameDivision && awayWon ? 1 : 0),
        divisionLosses:
          (as_.divisionLosses ?? 0) +
          (sameDivision && homeWon ? 1 : 0),
        conferenceWins:
          (as_.conferenceWins ?? 0) + (sameConference && awayWon ? 1 : 0),
        conferenceLosses:
          (as_.conferenceLosses ?? 0) +
          (sameConference && homeWon ? 1 : 0),
        pointsFor: (as_.pointsFor ?? 0) + awayScore,
        pointsAgainst: (as_.pointsAgainst ?? 0) + homeScore,
        streak: awayWon
          ? `W${parseInt((as_.streak ?? 'W0').replace(/[WL]/, '')) + (as_.streak?.startsWith('W') ? 1 : 1)}`
          : tie
            ? as_.streak
            : `L${parseInt((as_.streak ?? 'L0').replace(/[WL]/, '')) + (as_.streak?.startsWith('L') ? 1 : 1)}`,
      })
      .where(eq(standings.id, as_.id));
  }
}
