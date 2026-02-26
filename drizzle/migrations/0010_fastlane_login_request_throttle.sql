CREATE TABLE "fastlane_login_request_throttle" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL,
  "last_requested_at" timestamp DEFAULT now() NOT NULL,
  "request_count" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "fastlane_login_request_throttle_email_unique" UNIQUE("email")
);

CREATE UNIQUE INDEX "fastlane_login_request_throttle_email_idx" ON "fastlane_login_request_throttle" USING btree ("email");
CREATE INDEX "fastlane_login_request_throttle_last_requested_at_idx" ON "fastlane_login_request_throttle" USING btree ("last_requested_at");
