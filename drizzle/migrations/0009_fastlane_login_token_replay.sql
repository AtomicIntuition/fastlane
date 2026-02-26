CREATE TABLE "fastlane_login_token_replay" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "fastlane_login_token_replay_token_hash_unique" UNIQUE("token_hash")
);

CREATE UNIQUE INDEX "fastlane_login_token_replay_token_hash_idx" ON "fastlane_login_token_replay" USING btree ("token_hash");
CREATE INDEX "fastlane_login_token_replay_expires_at_idx" ON "fastlane_login_token_replay" USING btree ("expires_at");
