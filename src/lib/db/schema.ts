// ============================================================
// FastLane - Drizzle ORM Schema for Neon Postgres
// ============================================================

import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  text,
} from 'drizzle-orm/pg-core';

// ============================================================
// ENUMS
// ============================================================

export const fastlaneGoalEnum = pgEnum('fastlane_goal', [
  'weight',
  'energy',
  'metabolic',
  'routine',
]);

export const fastlaneExperienceEnum = pgEnum('fastlane_experience', [
  'new',
  'intermediate',
  'advanced',
]);

export const fastlaneTierEnum = pgEnum('fastlane_tier', ['free', 'pro']);

export const fastlaneSubscriptionStatusEnum = pgEnum('fastlane_subscription_status', [
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
]);

// ============================================================
// TABLES
// ============================================================

export const fastlaneUsers = pgTable(
  'fastlane_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 100 }).notNull().unique(),
    email: varchar('email', { length: 255 }),
    goal: fastlaneGoalEnum('goal').notNull().default('energy'),
    experience: fastlaneExperienceEnum('experience').notNull().default('new'),
    protocolId: varchar('protocol_id', { length: 50 }).notNull().default('16_8'),
    wakeTime: varchar('wake_time', { length: 5 }).notNull().default('07:00'),
    sleepTime: varchar('sleep_time', { length: 5 }).notNull().default('23:00'),
    reminders: boolean('reminders').notNull().default(true),
    tier: fastlaneTierEnum('tier').notNull().default('free'),
    onboarded: boolean('onboarded').notNull().default(false),
    activeFastStartAt: timestamp('active_fast_start_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex('fastlane_users_user_id_idx').on(table.userId),
  }),
);

export const fastlaneSessions = pgTable(
  'fastlane_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 100 }).notNull(),
    protocolId: varchar('protocol_id', { length: 50 }).notNull(),
    startAt: timestamp('start_at').notNull(),
    endAt: timestamp('end_at').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userEndIdx: index('fastlane_sessions_user_end_idx').on(table.userId, table.endAt),
  }),
);

export const fastlaneCheckIns = pgTable(
  'fastlane_checkins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 100 }).notNull(),
    loggedAt: timestamp('logged_at').notNull().defaultNow(),
    energy: integer('energy').notNull(),
    hunger: integer('hunger').notNull(),
    mood: integer('mood').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userLoggedIdx: index('fastlane_checkins_user_logged_idx').on(table.userId, table.loggedAt),
  }),
);

export const fastlaneSubscriptions = pgTable(
  'fastlane_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 100 }).notNull().unique(),
    stripeCustomerId: varchar('stripe_customer_id', { length: 100 }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 100 }),
    status: fastlaneSubscriptionStatusEnum('status').notNull().default('incomplete'),
    plan: varchar('plan', { length: 20 }),
    currentPeriodEnd: timestamp('current_period_end'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userSubIdx: uniqueIndex('fastlane_subscriptions_user_idx').on(table.userId),
    stripeCustomerIdx: index('fastlane_subscriptions_customer_idx').on(table.stripeCustomerId),
    stripeSubscriptionIdx: index('fastlane_subscriptions_subscription_idx').on(table.stripeSubscriptionId),
  }),
);

export const fastlaneWebhookEvents = pgTable(
  'fastlane_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stripeEventId: varchar('stripe_event_id', { length: 100 }).notNull().unique(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    payload: jsonb('payload').notNull(),
    processed: boolean('processed').notNull().default(false),
    processedAt: timestamp('processed_at'),
    replayCount: integer('replay_count').notNull().default(0),
    lastReplayAt: timestamp('last_replay_at'),
    lastReplayedBy: varchar('last_replayed_by', { length: 100 }),
    error: text('error'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    stripeEventIdx: uniqueIndex('fastlane_webhook_events_stripe_event_idx').on(table.stripeEventId),
    eventTypeIdx: index('fastlane_webhook_events_event_type_idx').on(table.eventType),
  }),
);

export const fastlaneAnalyticsEvents = pgTable(
  'fastlane_analytics_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 100 }),
    eventName: varchar('event_name', { length: 64 }).notNull(),
    source: varchar('source', { length: 20 }).notNull().default('web'),
    eventAt: timestamp('event_at').notNull().defaultNow(),
    props: jsonb('props'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    eventAtIdx: index('fastlane_analytics_events_event_at_idx').on(table.eventAt),
    eventNameEventAtIdx: index('fastlane_analytics_events_event_name_event_at_idx').on(
      table.eventName,
      table.eventAt,
    ),
    userEventAtIdx: index('fastlane_analytics_events_user_event_at_idx').on(table.userId, table.eventAt),
  }),
);

export const fastlaneLoginTokenReplay = pgTable(
  'fastlane_login_token_replay',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex('fastlane_login_token_replay_token_hash_idx').on(table.tokenHash),
    expiresAtIdx: index('fastlane_login_token_replay_expires_at_idx').on(table.expiresAt),
  }),
);

export const fastlaneLoginRequestThrottle = pgTable(
  'fastlane_login_request_throttle',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    lastRequestedAt: timestamp('last_requested_at').notNull().defaultNow(),
    requestCount: integer('request_count').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex('fastlane_login_request_throttle_email_idx').on(table.email),
    requestedAtIdx: index('fastlane_login_request_throttle_last_requested_at_idx').on(
      table.lastRequestedAt,
    ),
  }),
);
