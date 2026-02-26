CREATE TYPE "public"."fastlane_goal" AS ENUM('weight', 'energy', 'metabolic', 'routine');
CREATE TYPE "public"."fastlane_experience" AS ENUM('new', 'intermediate', 'advanced');
CREATE TYPE "public"."fastlane_tier" AS ENUM('free', 'pro');
CREATE TYPE "public"."fastlane_subscription_status" AS ENUM('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused');

CREATE TABLE "fastlane_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(100) NOT NULL,
  "email" varchar(255),
  "goal" "fastlane_goal" DEFAULT 'energy' NOT NULL,
  "experience" "fastlane_experience" DEFAULT 'new' NOT NULL,
  "protocol_id" varchar(50) DEFAULT '16_8' NOT NULL,
  "wake_time" varchar(5) DEFAULT '07:00' NOT NULL,
  "sleep_time" varchar(5) DEFAULT '23:00' NOT NULL,
  "reminders" boolean DEFAULT true NOT NULL,
  "tier" "fastlane_tier" DEFAULT 'free' NOT NULL,
  "onboarded" boolean DEFAULT false NOT NULL,
  "active_fast_start_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "fastlane_users_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE "fastlane_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(100) NOT NULL,
  "protocol_id" varchar(50) NOT NULL,
  "start_at" timestamp NOT NULL,
  "end_at" timestamp NOT NULL,
  "duration_minutes" integer NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE "fastlane_checkins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(100) NOT NULL,
  "logged_at" timestamp DEFAULT now() NOT NULL,
  "energy" integer NOT NULL,
  "hunger" integer NOT NULL,
  "mood" integer NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE "fastlane_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(100) NOT NULL,
  "stripe_customer_id" varchar(100),
  "stripe_subscription_id" varchar(100),
  "status" "fastlane_subscription_status" DEFAULT 'incomplete' NOT NULL,
  "plan" varchar(20),
  "current_period_end" timestamp,
  "cancel_at_period_end" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "fastlane_subscriptions_user_id_unique" UNIQUE("user_id")
);

CREATE UNIQUE INDEX "fastlane_users_user_id_idx" ON "fastlane_users" USING btree ("user_id");
CREATE INDEX "fastlane_sessions_user_end_idx" ON "fastlane_sessions" USING btree ("user_id", "end_at");
CREATE INDEX "fastlane_checkins_user_logged_idx" ON "fastlane_checkins" USING btree ("user_id", "logged_at");
CREATE UNIQUE INDEX "fastlane_subscriptions_user_idx" ON "fastlane_subscriptions" USING btree ("user_id");
CREATE INDEX "fastlane_subscriptions_customer_idx" ON "fastlane_subscriptions" USING btree ("stripe_customer_id");
CREATE INDEX "fastlane_subscriptions_subscription_idx" ON "fastlane_subscriptions" USING btree ("stripe_subscription_id");
