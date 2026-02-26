ALTER TABLE "fastlane_webhook_events"
  ADD COLUMN "replay_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "last_replay_at" timestamp,
  ADD COLUMN "last_replayed_by" varchar(100);
