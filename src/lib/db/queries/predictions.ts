import { db } from "@/lib/db";
import { predictions, games } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

/** Get a user's prediction for a game */
export async function getUserPrediction(userId: string, gameId: string) {
  const result = await db
    .select()
    .from(predictions)
    .where(
      and(eq(predictions.userId, userId), eq(predictions.gameId, gameId))
    )
    .limit(1);
  return result[0] ?? null;
}

/** Get all predictions for a user */
export async function getUserPredictions(userId: string) {
  return db
    .select()
    .from(predictions)
    .where(eq(predictions.userId, userId));
}

/** Create a new prediction */
export async function createPrediction(data: {
  userId: string;
  gameId: string;
  predictedWinner: string;
  predictedHomeScore: number;
  predictedAwayScore: number;
}) {
  // Check if prediction already exists
  const existing = await getUserPrediction(data.userId, data.gameId);
  if (existing) {
    throw new Error("Prediction already exists for this game");
  }

  // Check if game is still scheduled (not started)
  const game = await db
    .select()
    .from(games)
    .where(eq(games.id, data.gameId))
    .limit(1);

  if (game.length === 0) {
    throw new Error("Game not found");
  }

  if (game[0].status !== "scheduled") {
    throw new Error("Game has already started — predictions are locked");
  }

  await db.insert(predictions).values({
    ...data,
    result: "pending",
    pointsEarned: 0,
  });
}

/** Score predictions after a game completes */
export async function scorePredictions(
  gameId: string,
  winnerId: string,
  homeScore: number,
  awayScore: number
) {
  const actualMargin = Math.abs(homeScore - awayScore);

  await db.execute(sql`
    UPDATE predictions SET
      result = CASE
        WHEN predicted_winner = ${winnerId} THEN 'won'
        ELSE 'lost'
      END,
      points_earned = CASE
        WHEN predicted_winner != ${winnerId} THEN 0
        WHEN predicted_home_score = ${homeScore}
          AND predicted_away_score = ${awayScore} THEN 40
        WHEN ABS(ABS(predicted_home_score - predicted_away_score) - ${actualMargin}) <= 3 THEN 15
        ELSE 10
      END
    WHERE game_id = ${gameId}
  `);
}

/** Get all predictions for a game */
export async function getGamePredictions(gameId: string) {
  return db
    .select()
    .from(predictions)
    .where(eq(predictions.gameId, gameId));
}
