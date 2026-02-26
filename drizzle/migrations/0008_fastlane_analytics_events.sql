CREATE TABLE "fastlane_analytics_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(100),
  "event_name" varchar(64) NOT NULL,
  "source" varchar(20) DEFAULT 'web' NOT NULL,
  "event_at" timestamp DEFAULT now() NOT NULL,
  "props" jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX "fastlane_analytics_events_event_at_idx" ON "fastlane_analytics_events" USING btree ("event_at");
CREATE INDEX "fastlane_analytics_events_event_name_event_at_idx" ON "fastlane_analytics_events" USING btree ("event_name", "event_at");
CREATE INDEX "fastlane_analytics_events_user_event_at_idx" ON "fastlane_analytics_events" USING btree ("user_id", "event_at");
