CREATE TABLE "fastlane_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stripe_event_id" varchar(100) NOT NULL,
  "event_type" varchar(100) NOT NULL,
  "payload" jsonb NOT NULL,
  "processed" boolean DEFAULT false NOT NULL,
  "processed_at" timestamp,
  "error" text,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "fastlane_webhook_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);

CREATE UNIQUE INDEX "fastlane_webhook_events_stripe_event_idx"
  ON "fastlane_webhook_events" USING btree ("stripe_event_id");
CREATE INDEX "fastlane_webhook_events_event_type_idx"
  ON "fastlane_webhook_events" USING btree ("event_type");
