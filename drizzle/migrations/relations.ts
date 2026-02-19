import { relations } from "drizzle-orm/relations";
import { games, gameEvents, teams, players, seasons, predictions, standings } from "./schema";

export const gameEventsRelations = relations(gameEvents, ({one}) => ({
	game: one(games, {
		fields: [gameEvents.gameId],
		references: [games.id]
	}),
}));

export const gamesRelations = relations(games, ({one, many}) => ({
	gameEvents: many(gameEvents),
	team_awayTeamId: one(teams, {
		fields: [games.awayTeamId],
		references: [teams.id],
		relationName: "games_awayTeamId_teams_id"
	}),
	team_homeTeamId: one(teams, {
		fields: [games.homeTeamId],
		references: [teams.id],
		relationName: "games_homeTeamId_teams_id"
	}),
	player: one(players, {
		fields: [games.mvpPlayerId],
		references: [players.id]
	}),
	season: one(seasons, {
		fields: [games.seasonId],
		references: [seasons.id]
	}),
	predictions: many(predictions),
}));

export const playersRelations = relations(players, ({one, many}) => ({
	team: one(teams, {
		fields: [players.teamId],
		references: [teams.id]
	}),
	games: many(games),
	seasons: many(seasons),
}));

export const teamsRelations = relations(teams, ({many}) => ({
	players: many(players),
	games_awayTeamId: many(games, {
		relationName: "games_awayTeamId_teams_id"
	}),
	games_homeTeamId: many(games, {
		relationName: "games_homeTeamId_teams_id"
	}),
	predictions: many(predictions),
	standings: many(standings),
	seasons: many(seasons),
}));

export const seasonsRelations = relations(seasons, ({one, many}) => ({
	games: many(games),
	standings: many(standings),
	team: one(teams, {
		fields: [seasons.championTeamId],
		references: [teams.id]
	}),
	player: one(players, {
		fields: [seasons.mvpPlayerId],
		references: [players.id]
	}),
}));

export const predictionsRelations = relations(predictions, ({one}) => ({
	game: one(games, {
		fields: [predictions.gameId],
		references: [games.id]
	}),
	team: one(teams, {
		fields: [predictions.predictedWinner],
		references: [teams.id]
	}),
}));

export const standingsRelations = relations(standings, ({one}) => ({
	season: one(seasons, {
		fields: [standings.seasonId],
		references: [seasons.id]
	}),
	team: one(teams, {
		fields: [standings.teamId],
		references: [teams.id]
	}),
}));