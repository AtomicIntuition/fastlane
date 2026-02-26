import { NextRequest } from 'next/server';
import { and, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fastlaneAnalyticsEvents, fastlaneUsers } from '@/lib/db/schema';
import { isAdminAuthorized } from '@/lib/utils/admin-session-cookie';
import { adminNoStoreJson } from '@/lib/fastlane/admin-api-headers';
import {
  DEFAULT_ADMIN_KPI_DAYS,
  MAX_ADMIN_KPI_DAYS,
} from '@/lib/fastlane/admin-kpi-window';

type FunnelEvent =
  | 'landing_cta_clicked'
  | 'signup_started'
  | 'onboarding_completed'
  | 'first_fast_started'
  | 'first_fast_completed'
  | 'trial_started';

function toPositiveInt(value: string | null): number | null {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAdminAuthorized(request)) {
      return adminNoStoreJson({ error: 'Unauthorized' }, 401);
    }

    const unknownQueryKey = Array.from(request.nextUrl.searchParams.keys()).find(
      (key) => key !== 'days',
    );
    if (unknownQueryKey !== undefined) {
      return adminNoStoreJson({ error: `Unknown query parameter: ${unknownQueryKey}` }, 400);
    }

    const daysRaw = request.nextUrl.searchParams.get('days');
    const parsedDays = daysRaw === null ? DEFAULT_ADMIN_KPI_DAYS : toPositiveInt(daysRaw);
    if (daysRaw !== null && parsedDays === null) {
      return adminNoStoreJson({ error: 'Invalid days' }, 400);
    }
    if ((parsedDays ?? DEFAULT_ADMIN_KPI_DAYS) > MAX_ADMIN_KPI_DAYS) {
      return adminNoStoreJson({ error: 'Invalid days' }, 400);
    }
    const days = parsedDays ?? DEFAULT_ADMIN_KPI_DAYS;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totalsByEvent, uniqueUsersResult, accountSummary] = await Promise.all([
      db
        .select({
          eventName: fastlaneAnalyticsEvents.eventName,
          count: sql<number>`count(*)::int`,
        })
        .from(fastlaneAnalyticsEvents)
        .where(gte(fastlaneAnalyticsEvents.eventAt, since))
        .groupBy(fastlaneAnalyticsEvents.eventName),
      db
        .select({
          uniqueUsers: sql<number>`count(distinct ${fastlaneAnalyticsEvents.userId})::int`,
        })
        .from(fastlaneAnalyticsEvents)
        .where(
          and(
            gte(fastlaneAnalyticsEvents.eventAt, since),
            sql`${fastlaneAnalyticsEvents.userId} is not null`,
          ),
        )
        .limit(1),
      db
        .select({
          totalUsers: sql<number>`count(*)::int`,
          linkedUsers: sql<number>`count(*) filter (where ${fastlaneUsers.email} is not null)::int`,
        })
        .from(fastlaneUsers)
        .limit(1),
    ]);

    const counts: Record<string, number> = {};
    for (const row of totalsByEvent) {
      counts[row.eventName] = row.count;
    }

    const totalEvents = totalsByEvent.reduce((sum, row) => sum + row.count, 0);
    const uniqueUsers = uniqueUsersResult[0]?.uniqueUsers ?? 0;
    const totalUsers = accountSummary[0]?.totalUsers ?? 0;
    const linkedUsers = accountSummary[0]?.linkedUsers ?? 0;

    const funnelCounts: Record<FunnelEvent, number> = {
      landing_cta_clicked: counts.landing_cta_clicked ?? 0,
      signup_started: counts.signup_started ?? 0,
      onboarding_completed: counts.onboarding_completed ?? 0,
      first_fast_started: counts.first_fast_started ?? 0,
      first_fast_completed: counts.first_fast_completed ?? 0,
      trial_started: counts.trial_started ?? 0,
    };

    const paywallViewed = counts.paywall_viewed ?? 0;

    return adminNoStoreJson({
      windowDays: days,
      since: since.toISOString(),
      totals: {
        totalEvents,
        uniqueUsers,
      },
      funnel: {
        counts: funnelCounts,
        rates: {
          ctaToSignup: toPercent(funnelCounts.signup_started, funnelCounts.landing_cta_clicked),
          signupToOnboarding: toPercent(funnelCounts.onboarding_completed, funnelCounts.signup_started),
          onboardingToFirstFastStart: toPercent(
            funnelCounts.first_fast_started,
            funnelCounts.onboarding_completed,
          ),
          startToComplete: toPercent(
            funnelCounts.first_fast_completed,
            funnelCounts.first_fast_started,
          ),
          completionToTrial: toPercent(
            funnelCounts.trial_started,
            funnelCounts.first_fast_completed,
          ),
        },
      },
      monetization: {
        paywallViewed,
        trialStarted: funnelCounts.trial_started,
        paywallToTrialRate: toPercent(funnelCounts.trial_started, paywallViewed),
      },
      auth: {
        totalUsers,
        linkedUsers,
        linkedUserRate: toPercent(linkedUsers, totalUsers),
      },
      topEvents: totalsByEvent
        .slice()
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    });
  } catch {
    return adminNoStoreJson({ error: 'Unable to load KPI dashboard' }, 500);
  }
}
