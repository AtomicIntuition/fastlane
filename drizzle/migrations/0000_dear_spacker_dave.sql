-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."conference" AS ENUM('AFC', 'NFC');--> statement-breakpoint
CREATE TYPE "public"."division" AS ENUM('North', 'South', 'East', 'West');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('scheduled', 'simulating', 'broadcasting', 'completed');--> statement-breakpoint
CREATE TYPE "public"."game_type" AS ENUM('regular', 'wild_card', 'divisional', 'conference_championship', 'super_bowl');--> statement-breakpoint
CREATE TYPE "public"."play_style" AS ENUM('balanced', 'pass_heavy', 'run_heavy', 'aggressive', 'conservative');--> statement-breakpoint
CREATE TYPE "public"."position" AS ENUM('QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P');--> statement-breakpoint
CREATE TYPE "public"."prediction_result" AS ENUM('pending', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."season_status" AS ENUM('regular_season', 'wild_card', 'divisional', 'conference_championship', 'super_bowl', 'offseason');--> statement-breakpoint
CREATE TABLE "game_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"event_number" integer NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"play_result" jsonb NOT NULL,
	"commentary" jsonb NOT NULL,
	"game_state" jsonb NOT NULL,
	"narrative_context" jsonb,
	"display_timestamp" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "game_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"position" "position" NOT NULL,
	"number" integer NOT NULL,
	"rating" integer NOT NULL,
	"speed" integer NOT NULL,
	"strength" integer NOT NULL,
	"awareness" integer NOT NULL,
	"clutch_rating" integer NOT NULL,
	"injury_prone" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "players" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"week" integer NOT NULL,
	"game_type" "game_type" DEFAULT 'regular' NOT NULL,
	"home_team_id" uuid NOT NULL,
	"away_team_id" uuid NOT NULL,
	"home_score" integer DEFAULT 0,
	"away_score" integer DEFAULT 0,
	"status" "game_status" DEFAULT 'scheduled' NOT NULL,
	"is_featured" boolean DEFAULT false,
	"server_seed_hash" varchar(64),
	"server_seed" varchar(64),
	"client_seed" varchar(64),
	"nonce" integer,
	"total_plays" integer,
	"mvp_player_id" uuid,
	"box_score" jsonb,
	"broadcast_started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "games" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(100) NOT NULL,
	"game_id" uuid NOT NULL,
	"predicted_winner" uuid NOT NULL,
	"predicted_home_score" integer NOT NULL,
	"predicted_away_score" integer NOT NULL,
	"points_earned" integer DEFAULT 0,
	"result" "prediction_result" DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "predictions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "standings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"wins" integer DEFAULT 0,
	"losses" integer DEFAULT 0,
	"ties" integer DEFAULT 0,
	"division_wins" integer DEFAULT 0,
	"division_losses" integer DEFAULT 0,
	"conference_wins" integer DEFAULT 0,
	"conference_losses" integer DEFAULT 0,
	"points_for" integer DEFAULT 0,
	"points_against" integer DEFAULT 0,
	"streak" varchar(10) DEFAULT 'W0',
	"playoff_seed" integer,
	"clinched" varchar(20)
);
--> statement-breakpoint
ALTER TABLE "standings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(100) NOT NULL,
	"total_points" integer DEFAULT 0,
	"correct_predictions" integer DEFAULT 0,
	"total_predictions" integer DEFAULT 0,
	"current_streak" integer DEFAULT 0,
	"best_streak" integer DEFAULT 0,
	"rank" integer,
	CONSTRAINT "user_scores_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_number" integer NOT NULL,
	"current_week" integer DEFAULT 1 NOT NULL,
	"total_weeks" integer DEFAULT 22 NOT NULL,
	"status" "season_status" DEFAULT 'regular_season' NOT NULL,
	"champion_team_id" uuid,
	"mvp_player_id" uuid,
	"seed" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "seasons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"abbreviation" varchar(5) NOT NULL,
	"city" varchar(50) NOT NULL,
	"mascot" varchar(50) NOT NULL,
	"conference" "conference" NOT NULL,
	"division" "division" NOT NULL,
	"primary_color" varchar(7) NOT NULL,
	"secondary_color" varchar(7) NOT NULL,
	"offense_rating" integer NOT NULL,
	"defense_rating" integer NOT NULL,
	"special_teams_rating" integer NOT NULL,
	"play_style" "play_style" DEFAULT 'balanced' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_mvp_player_id_players_id_fk" FOREIGN KEY ("mvp_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_predicted_winner_teams_id_fk" FOREIGN KEY ("predicted_winner") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_champion_team_id_teams_id_fk" FOREIGN KEY ("champion_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_mvp_player_id_players_id_fk" FOREIGN KEY ("mvp_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_events_game_event_number_idx" ON "game_events" USING btree ("game_id" int4_ops,"event_number" int4_ops);--> statement-breakpoint
CREATE INDEX "games_featured_status_idx" ON "games" USING btree ("is_featured" bool_ops,"status" enum_ops);--> statement-breakpoint
CREATE INDEX "games_season_week_idx" ON "games" USING btree ("season_id" uuid_ops,"week" uuid_ops);--> statement-breakpoint
CREATE INDEX "games_status_idx" ON "games" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "predictions_user_game_idx" ON "predictions" USING btree ("user_id" text_ops,"game_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "standings_season_team_idx" ON "standings" USING btree ("season_id" uuid_ops,"team_id" uuid_ops);
*/