import { NextRequest } from 'next/server';
import { and, eq, gt, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  fastlaneLoginRequestThrottle,
  fastlaneLoginTokenReplay,
  fastlaneSubscriptions,
  fastlaneUsers,
  fastlaneWebhookEvents,
} from '@/lib/db/schema';
import { isAdminAuthorized } from '@/lib/utils/admin-session-cookie';
import { getServiceReadiness } from '@/lib/utils/service-readiness';
import { adminNoStoreJson } from '@/lib/fastlane/admin-api-headers';
import { getMaintenanceOpsTelemetrySnapshot } from '@/lib/fastlane/maintenance-ops-telemetry';

export async function GET(request: NextRequest) {
  try {
    if (!isAdminAuthorized(request)) {
      return adminNoStoreJson({ error: 'Unauthorized' }, 401);
    }

    const unknownQueryKey = Array.from(request.nextUrl.searchParams.keys())[0];
    if (unknownQueryKey !== undefined) {
      return adminNoStoreJson({ error: `Unknown query parameter: ${unknownQueryKey}` }, 400);
    }

    const readiness = getServiceReadiness();

    const [
      failedRows,
      linkedRows,
      replayActiveRows,
      replayExpiredRows,
      billingRiskRows,
      cancelRows,
      failedAgeRows,
      throttleActiveRows,
      throttleStaleRows,
      maintenanceTelemetry,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(fastlaneWebhookEvents)
        .where(
          and(
            eq(fastlaneWebhookEvents.processed, false),
            isNotNull(fastlaneWebhookEvents.error),
          ),
        )
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(fastlaneUsers)
        .where(isNotNull(fastlaneUsers.email))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(fastlaneLoginTokenReplay)
        .where(gt(fastlaneLoginTokenReplay.expiresAt, new Date()))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(fastlaneLoginTokenReplay)
        .where(lte(fastlaneLoginTokenReplay.expiresAt, new Date()))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(fastlaneSubscriptions)
        .where(
          sql`${fastlaneSubscriptions.status} in ('past_due', 'unpaid')`,
        )
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(fastlaneSubscriptions)
        .where(eq(fastlaneSubscriptions.cancelAtPeriodEnd, true))
        .limit(1),
      db
        .select({
          ageMinutes:
            sql<number>`coalesce(round(extract(epoch from (now() - min(${fastlaneWebhookEvents.createdAt}))) / 60.0), 0)::int`,
        })
        .from(fastlaneWebhookEvents)
        .where(
          and(
            eq(fastlaneWebhookEvents.processed, false),
            isNotNull(fastlaneWebhookEvents.error),
          ),
        )
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(fastlaneLoginRequestThrottle)
        .where(gt(fastlaneLoginRequestThrottle.lastRequestedAt, sql`now() - interval '30 days'`))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(fastlaneLoginRequestThrottle)
        .where(lte(fastlaneLoginRequestThrottle.lastRequestedAt, sql`now() - interval '30 days'`))
        .limit(1),
      getMaintenanceOpsTelemetrySnapshot(),
    ]);

    const failedWebhookEvents = failedRows[0]?.count ?? 0;
    const linkedAccounts = linkedRows[0]?.count ?? 0;
    const activeLoginReplayMarkers = replayActiveRows[0]?.count ?? 0;
    const expiredLoginReplayMarkers = replayExpiredRows[0]?.count ?? 0;
    const billingAtRiskSubscriptions = billingRiskRows[0]?.count ?? 0;
    const scheduledCancellations = cancelRows[0]?.count ?? 0;
    const oldestFailedWebhookAgeMinutes = failedRows[0]?.count
      ? Math.max(0, failedAgeRows[0]?.ageMinutes ?? 0)
      : 0;
    const authThrottleActiveRows = throttleActiveRows[0]?.count ?? 0;
    const authThrottleStaleRows = throttleStaleRows[0]?.count ?? 0;

    const isProduction = process.env.NODE_ENV === 'production';
    const status =
      readiness.readyForProduction && failedWebhookEvents === 0
        ? 'ready'
        : isProduction
          ? 'degraded'
          : 'staging';

    return adminNoStoreJson({
      status,
      timestamp: new Date().toISOString(),
      readiness,
      operations: {
        failedWebhookEvents,
        linkedAccounts,
        activeLoginReplayMarkers,
        expiredLoginReplayMarkers,
        billingAtRiskSubscriptions,
        scheduledCancellations,
        oldestFailedWebhookAgeMinutes,
        authThrottleActiveRows,
        authThrottleStaleRows,
        maintenanceActionSuccessCount: maintenanceTelemetry.maintenanceActionSuccessCount,
        maintenanceActionFailureCount: maintenanceTelemetry.maintenanceActionFailureCount,
        lastMaintenanceSuccessAt: maintenanceTelemetry.lastMaintenanceSuccessAt,
        lastMaintenanceFailureAt: maintenanceTelemetry.lastMaintenanceFailureAt,
        maintenanceReplaySuccessCount: maintenanceTelemetry.byRoute.replay.successCount,
        maintenanceReplayFailureCount: maintenanceTelemetry.byRoute.replay.failureCount,
        maintenanceReplayLastEventAt: maintenanceTelemetry.byRoute.replay.lastEventAt,
        maintenanceThrottleSuccessCount: maintenanceTelemetry.byRoute.throttle.successCount,
        maintenanceThrottleFailureCount: maintenanceTelemetry.byRoute.throttle.failureCount,
        maintenanceThrottleLastEventAt: maintenanceTelemetry.byRoute.throttle.lastEventAt,
        maintenanceRunSuccessCount: maintenanceTelemetry.byRoute.run.successCount,
        maintenanceRunFailureCount: maintenanceTelemetry.byRoute.run.failureCount,
        maintenanceRunLastEventAt: maintenanceTelemetry.byRoute.run.lastEventAt,
      },
    });
  } catch {
    return adminNoStoreJson({ error: 'Unable to load admin readiness' }, 500);
  }
}
