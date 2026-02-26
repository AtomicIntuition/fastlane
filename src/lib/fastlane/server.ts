import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  fastlaneCheckIns,
  fastlaneSessions,
  fastlaneSubscriptions,
  fastlaneUsers,
} from '@/lib/db/schema';
import { DEFAULT_STATE, getFastingProtocolById, type FastLaneState } from './types';
import { getUserIdFromRequest } from '@/lib/utils/signed-cookie';
import { getFastLaneAccountSessionUserIdFromRequest } from '@/lib/utils/fastlane-account-session-cookie';

const FASTLANE_DB_ID_MAX_LENGTH = 100;
const FASTLANE_PLAN_MAX_LENGTH = 20;
const STRIPE_CUSTOMER_ID_PATTERN = /^cus_[A-Za-z0-9_]+$/;
const STRIPE_SUBSCRIPTION_ID_PATTERN = /^sub_[A-Za-z0-9_]+$/;
const FASTLANE_PLAN_PATTERN = /^(monthly|yearly)$/;

function normalizeOptionalStripeId(
  value: string | null | undefined,
  pattern: RegExp,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > FASTLANE_DB_ID_MAX_LENGTH) return undefined;
  if (!pattern.test(normalized)) return undefined;
  return normalized;
}

function normalizeOptionalPlan(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return null;
  if (normalized.length > FASTLANE_PLAN_MAX_LENGTH) return undefined;
  if (!FASTLANE_PLAN_PATTERN.test(normalized)) return undefined;
  return normalized;
}

export async function ensureFastLaneUser(userId: string) {
  const existing = await db.select().from(fastlaneUsers).where(eq(fastlaneUsers.userId, userId)).limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(fastlaneUsers)
    .values({ userId })
    .onConflictDoNothing({ target: fastlaneUsers.userId })
    .returning();

  if (inserted[0]) return inserted[0];

  // Another request likely created the row first; fetch canonical state.
  const afterConflict = await db
    .select()
    .from(fastlaneUsers)
    .where(eq(fastlaneUsers.userId, userId))
    .limit(1);

  if (!afterConflict[0]) {
    throw new Error('Failed to load FastLane user after conflict');
  }

  return afterConflict[0];
}

export async function getFastLaneStateForUser(userId: string): Promise<FastLaneState> {
  const user = await ensureFastLaneUser(userId);

  const [sessions, checkIns, subscriptionRows] = await Promise.all([
    db
      .select()
      .from(fastlaneSessions)
      .where(eq(fastlaneSessions.userId, userId))
      .orderBy(desc(fastlaneSessions.endAt))
      .limit(120),
    db
      .select()
      .from(fastlaneCheckIns)
      .where(eq(fastlaneCheckIns.userId, userId))
      .orderBy(desc(fastlaneCheckIns.loggedAt))
      .limit(60),
    db
      .select()
      .from(fastlaneSubscriptions)
      .where(eq(fastlaneSubscriptions.userId, userId))
      .limit(1),
  ]);

  const sub = subscriptionRows[0];
  const isPro = sub?.status === 'active' || sub?.status === 'trialing';
  const resolvedTier: FastLaneState['tier'] = sub ? (isPro ? 'pro' : 'free') : 'free';
  const profileProtocolId =
    getFastingProtocolById(user.protocolId)?.id ?? DEFAULT_STATE.profile.protocolId;

  return {
    ...DEFAULT_STATE,
    onboarded: user.onboarded,
    tier: resolvedTier,
    profile: {
      goal: user.goal,
      experience: user.experience,
      protocolId: profileProtocolId,
      wakeTime: user.wakeTime,
      sleepTime: user.sleepTime,
      reminders: user.reminders,
    },
    activeFastStartAt: user.activeFastStartAt ? user.activeFastStartAt.toISOString() : null,
    sessions: sessions.map((s) => ({
      id: s.id,
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
      durationMinutes: s.durationMinutes,
      protocolId: s.protocolId,
    })),
    checkIns: checkIns.map((c) => ({
      date: c.loggedAt.toISOString(),
      energy: c.energy,
      hunger: c.hunger,
      mood: c.mood,
    })),
    flags: {
      firstFastStartedTracked: sessions.length > 0 || !!user.activeFastStartAt,
      firstFastCompletedTracked: sessions.length > 0,
      postOnboardingPaywallSeen: user.onboarded,
    },
  };
}

export function requireFastLaneUserId(request: NextRequest): string | null {
  const accountSessionUserId = getFastLaneAccountSessionUserIdFromRequest(request);
  if (accountSessionUserId) return accountSessionUserId;
  return getUserIdFromRequest(request);
}

export function unauthorized() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
}

export async function getFastLaneSubscriptionByCustomer(customerId: string) {
  const rows = await db
    .select()
    .from(fastlaneSubscriptions)
    .where(eq(fastlaneSubscriptions.stripeCustomerId, customerId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getEffectiveFastLaneTier(
  userId: string,
  fallbackTier: FastLaneState['tier'] = 'free',
): Promise<FastLaneState['tier']> {
  const rows = await db
    .select({ status: fastlaneSubscriptions.status })
    .from(fastlaneSubscriptions)
    .where(eq(fastlaneSubscriptions.userId, userId))
    .limit(1);
  const status = rows[0]?.status;
  if (!status) return fallbackTier;
  if (status === 'active' || status === 'trialing') return 'pro';
  return 'free';
}

export async function upsertFastLaneSubscription(input: {
  userId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  status?: typeof fastlaneSubscriptions.$inferInsert.status;
  plan?: string | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}) {
  const normalizedCustomerId = normalizeOptionalStripeId(input.stripeCustomerId, STRIPE_CUSTOMER_ID_PATTERN);
  const normalizedSubscriptionId = normalizeOptionalStripeId(input.stripeSubscriptionId, STRIPE_SUBSCRIPTION_ID_PATTERN);
  const normalizedPlan = normalizeOptionalPlan(input.plan);

  const updateSet = {
    ...(normalizedCustomerId !== undefined ? { stripeCustomerId: normalizedCustomerId } : {}),
    ...(normalizedSubscriptionId !== undefined ? { stripeSubscriptionId: normalizedSubscriptionId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(normalizedPlan !== undefined ? { plan: normalizedPlan } : {}),
    ...(input.currentPeriodEnd !== undefined ? { currentPeriodEnd: input.currentPeriodEnd } : {}),
    ...(input.cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd: input.cancelAtPeriodEnd } : {}),
    updatedAt: new Date(),
  };

  const existing = await db
    .select()
    .from(fastlaneSubscriptions)
    .where(eq(fastlaneSubscriptions.userId, input.userId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(fastlaneSubscriptions)
      .set(updateSet)
      .where(eq(fastlaneSubscriptions.userId, input.userId));
  } else {
    const inserted = await db
      .insert(fastlaneSubscriptions)
      .values({
        userId: input.userId,
        stripeCustomerId: normalizedCustomerId ?? null,
        stripeSubscriptionId: normalizedSubscriptionId ?? null,
        status: input.status ?? 'incomplete',
        plan: normalizedPlan ?? null,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      })
      .onConflictDoNothing({ target: fastlaneSubscriptions.userId })
      .returning({ id: fastlaneSubscriptions.id });

    if (!inserted[0]) {
      await db
        .update(fastlaneSubscriptions)
        .set(updateSet)
        .where(eq(fastlaneSubscriptions.userId, input.userId));
    }
  }

  if (input.status !== undefined) {
    const nextTier = input.status === 'active' || input.status === 'trialing' ? 'pro' : 'free';
    await db
      .update(fastlaneUsers)
      .set({ tier: nextTier, updatedAt: new Date() })
      .where(eq(fastlaneUsers.userId, input.userId));
  }
}

export async function findFastLaneSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string) {
  const rows = await db
    .select()
    .from(fastlaneSubscriptions)
    .where(eq(fastlaneSubscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  return rows[0] ?? null;
}
