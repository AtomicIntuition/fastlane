import { pgTable, uniqueIndex, foreignKey, bigserial, uuid, integer, varchar, jsonb, timestamp, boolean, index, unique, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const conference = pgEnum("conference", ['AFC', 'NFC'])
export const division = pgEnum("division", ['North', 'South', 'East', 'West'])
export const gameStatus = pgEnum("game_status", ['scheduled', 'simulating', 'broadcasting', 'completed'])
export const gameType = pgEnum("game_type", ['regular', 'wild_card', 'divisional', 'conference_championship', 'super_bowl'])
export const playStyle = pgEnum("play_style", ['balanced', 'pass_heavy', 'run_heavy', 'aggressive', 'conservative'])
export const position = pgEnum("position", ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'])
export const predictionResult = pgEnum("prediction_result", ['pending', 'won', 'lost'])
export const seasonStatus = pgEnum("season_status", ['regular_season', 'wild_card', 'divisional', 'conference_championship', 'super_bowl', 'offseason'])


export const gameEvents = pgTable("game_events", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	gameId: uuid("game_id").notNull(),
	eventNumber: integer("event_number").notNull(),
	eventType: varchar("event_type", { length: 50 }).notNull(),
	playResult: jsonb("play_result").notNull(),
	commentary: jsonb().notNull(),
	gameState: jsonb("game_state").notNull(),
	narrativeContext: jsonb("narrative_context"),
	displayTimestamp: integer("display_timestamp").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("game_events_game_event_number_idx").using("btree", table.gameId.asc().nullsLast().op("int4_ops"), table.eventNumber.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.gameId],
			foreignColumns: [games.id],
			name: "game_events_game_id_games_id_fk"
		}),
]);

export const players = pgTable("players", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	teamId: uuid("team_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	position: position().notNull(),
	number: integer().notNull(),
	rating: integer().notNull(),
	speed: integer().notNull(),
	strength: integer().notNull(),
	awareness: integer().notNull(),
	clutchRating: integer("clutch_rating").notNull(),
	injuryProne: boolean("injury_prone").default(false),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "players_team_id_teams_id_fk"
		}),
]);

export const games = pgTable("games", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	seasonId: uuid("season_id").notNull(),
	week: integer().notNull(),
	gameType: gameType("game_type").default('regular').notNull(),
	homeTeamId: uuid("home_team_id").notNull(),
	awayTeamId: uuid("away_team_id").notNull(),
	homeScore: integer("home_score").default(0),
	awayScore: integer("away_score").default(0),
	status: gameStatus().default('scheduled').notNull(),
	isFeatured: boolean("is_featured").default(false),
	serverSeedHash: varchar("server_seed_hash", { length: 64 }),
	serverSeed: varchar("server_seed", { length: 64 }),
	clientSeed: varchar("client_seed", { length: 64 }),
	nonce: integer(),
	totalPlays: integer("total_plays"),
	mvpPlayerId: uuid("mvp_player_id"),
	boxScore: jsonb("box_score"),
	broadcastStartedAt: timestamp("broadcast_started_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("games_featured_status_idx").using("btree", table.isFeatured.asc().nullsLast().op("bool_ops"), table.status.asc().nullsLast().op("enum_ops")),
	index("games_season_week_idx").using("btree", table.seasonId.asc().nullsLast().op("uuid_ops"), table.week.asc().nullsLast().op("uuid_ops")),
	index("games_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.awayTeamId],
			foreignColumns: [teams.id],
			name: "games_away_team_id_teams_id_fk"
		}),
	foreignKey({
			columns: [table.homeTeamId],
			foreignColumns: [teams.id],
			name: "games_home_team_id_teams_id_fk"
		}),
	foreignKey({
			columns: [table.mvpPlayerId],
			foreignColumns: [players.id],
			name: "games_mvp_player_id_players_id_fk"
		}),
	foreignKey({
			columns: [table.seasonId],
			foreignColumns: [seasons.id],
			name: "games_season_id_seasons_id_fk"
		}),
]);

export const predictions = pgTable("predictions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id", { length: 100 }).notNull(),
	gameId: uuid("game_id").notNull(),
	predictedWinner: uuid("predicted_winner").notNull(),
	predictedHomeScore: integer("predicted_home_score").notNull(),
	predictedAwayScore: integer("predicted_away_score").notNull(),
	pointsEarned: integer("points_earned").default(0),
	result: predictionResult().default('pending'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("predictions_user_game_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.gameId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.gameId],
			foreignColumns: [games.id],
			name: "predictions_game_id_games_id_fk"
		}),
	foreignKey({
			columns: [table.predictedWinner],
			foreignColumns: [teams.id],
			name: "predictions_predicted_winner_teams_id_fk"
		}),
]);

export const standings = pgTable("standings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	seasonId: uuid("season_id").notNull(),
	teamId: uuid("team_id").notNull(),
	wins: integer().default(0),
	losses: integer().default(0),
	ties: integer().default(0),
	divisionWins: integer("division_wins").default(0),
	divisionLosses: integer("division_losses").default(0),
	conferenceWins: integer("conference_wins").default(0),
	conferenceLosses: integer("conference_losses").default(0),
	pointsFor: integer("points_for").default(0),
	pointsAgainst: integer("points_against").default(0),
	streak: varchar({ length: 10 }).default('W0'),
	playoffSeed: integer("playoff_seed"),
	clinched: varchar({ length: 20 }),
}, (table) => [
	uniqueIndex("standings_season_team_idx").using("btree", table.seasonId.asc().nullsLast().op("uuid_ops"), table.teamId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.seasonId],
			foreignColumns: [seasons.id],
			name: "standings_season_id_seasons_id_fk"
		}),
	foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "standings_team_id_teams_id_fk"
		}),
]);

export const userScores = pgTable("user_scores", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id", { length: 100 }).notNull(),
	totalPoints: integer("total_points").default(0),
	correctPredictions: integer("correct_predictions").default(0),
	totalPredictions: integer("total_predictions").default(0),
	currentStreak: integer("current_streak").default(0),
	bestStreak: integer("best_streak").default(0),
	rank: integer(),
}, (table) => [
	unique("user_scores_user_id_unique").on(table.userId),
]);

export const seasons = pgTable("seasons", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	seasonNumber: integer("season_number").notNull(),
	currentWeek: integer("current_week").default(1).notNull(),
	totalWeeks: integer("total_weeks").default(22).notNull(),
	status: seasonStatus().default('regular_season').notNull(),
	championTeamId: uuid("champion_team_id"),
	mvpPlayerId: uuid("mvp_player_id"),
	seed: varchar({ length: 64 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.championTeamId],
			foreignColumns: [teams.id],
			name: "seasons_champion_team_id_teams_id_fk"
		}),
	foreignKey({
			columns: [table.mvpPlayerId],
			foreignColumns: [players.id],
			name: "seasons_mvp_player_id_players_id_fk"
		}),
]);

export const teams = pgTable("teams", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	abbreviation: varchar({ length: 5 }).notNull(),
	city: varchar({ length: 50 }).notNull(),
	mascot: varchar({ length: 50 }).notNull(),
	conference: conference().notNull(),
	division: division().notNull(),
	primaryColor: varchar("primary_color", { length: 7 }).notNull(),
	secondaryColor: varchar("secondary_color", { length: 7 }).notNull(),
	offenseRating: integer("offense_rating").notNull(),
	defenseRating: integer("defense_rating").notNull(),
	specialTeamsRating: integer("special_teams_rating").notNull(),
	playStyle: playStyle("play_style").default('balanced').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});
