import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fastlaneAnalyticsEvents } from '@/lib/db/schema';

const MAINTENANCE_SUCCESS_EVENTS = [
  'admin_maintenance_replay_success',
  'admin_maintenance_throttle_success',
  'admin_maintenance_run_success',
] as const;

const MAINTENANCE_FAILURE_EVENTS = [
  'admin_maintenance_replay_failure',
  'admin_maintenance_throttle_failure',
  'admin_maintenance_run_failure',
] as const;

export type MaintenanceTelemetryEventName =
  | (typeof MAINTENANCE_SUCCESS_EVENTS)[number]
  | (typeof MAINTENANCE_FAILURE_EVENTS)[number];

export interface MaintenanceOpsTelemetrySnapshot {
  maintenanceActionSuccessCount: number;
  maintenanceActionFailureCount: number;
  lastMaintenanceSuccessAt: string | null;
  lastMaintenanceFailureAt: string | null;
  byRoute: {
    replay: { successCount: number; failureCount: number; lastEventAt: string | null };
    throttle: { successCount: number; failureCount: number; lastEventAt: string | null };
    run: { successCount: number; failureCount: number; lastEventAt: string | null };
  };
}

export async function recordMaintenanceTelemetryEvent(
  eventName: MaintenanceTelemetryEventName,
  props?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(fastlaneAnalyticsEvents).values({
      eventName,
      source: 'server',
      props: props ?? null,
      eventAt: new Date(),
    });
  } catch {
    // Telemetry should never block maintenance operations.
  }
}

export async function getMaintenanceOpsTelemetrySnapshot(): Promise<MaintenanceOpsTelemetrySnapshot> {
  const successListSql = sql.raw(
    MAINTENANCE_SUCCESS_EVENTS.map((eventName) => `'${eventName}'`).join(', '),
  );
  const failureListSql = sql.raw(
    MAINTENANCE_FAILURE_EVENTS.map((eventName) => `'${eventName}'`).join(', '),
  );

  const rows = await db
    .select({
      maintenanceActionSuccessCount:
        sql<number>`coalesce(sum(case when ${fastlaneAnalyticsEvents.eventName} in (${successListSql}) then 1 else 0 end), 0)::int`,
      maintenanceActionFailureCount:
        sql<number>`coalesce(sum(case when ${fastlaneAnalyticsEvents.eventName} in (${failureListSql}) then 1 else 0 end), 0)::int`,
      replaySuccessCount:
        sql<number>`coalesce(sum(case when ${fastlaneAnalyticsEvents.eventName} = 'admin_maintenance_replay_success' then 1 else 0 end), 0)::int`,
      replayFailureCount:
        sql<number>`coalesce(sum(case when ${fastlaneAnalyticsEvents.eventName} = 'admin_maintenance_replay_failure' then 1 else 0 end), 0)::int`,
      throttleSuccessCount:
        sql<number>`coalesce(sum(case when ${fastlaneAnalyticsEvents.eventName} = 'admin_maintenance_throttle_success' then 1 else 0 end), 0)::int`,
      throttleFailureCount:
        sql<number>`coalesce(sum(case when ${fastlaneAnalyticsEvents.eventName} = 'admin_maintenance_throttle_failure' then 1 else 0 end), 0)::int`,
      runSuccessCount:
        sql<number>`coalesce(sum(case when ${fastlaneAnalyticsEvents.eventName} = 'admin_maintenance_run_success' then 1 else 0 end), 0)::int`,
      runFailureCount:
        sql<number>`coalesce(sum(case when ${fastlaneAnalyticsEvents.eventName} = 'admin_maintenance_run_failure' then 1 else 0 end), 0)::int`,
      replayLastEventAt:
        sql<Date | null>`max(case when ${fastlaneAnalyticsEvents.eventName} in ('admin_maintenance_replay_success', 'admin_maintenance_replay_failure') then ${fastlaneAnalyticsEvents.eventAt} else null end)`,
      throttleLastEventAt:
        sql<Date | null>`max(case when ${fastlaneAnalyticsEvents.eventName} in ('admin_maintenance_throttle_success', 'admin_maintenance_throttle_failure') then ${fastlaneAnalyticsEvents.eventAt} else null end)`,
      runLastEventAt:
        sql<Date | null>`max(case when ${fastlaneAnalyticsEvents.eventName} in ('admin_maintenance_run_success', 'admin_maintenance_run_failure') then ${fastlaneAnalyticsEvents.eventAt} else null end)`,
      lastMaintenanceSuccessAt:
        sql<Date | null>`max(case when ${fastlaneAnalyticsEvents.eventName} in (${successListSql}) then ${fastlaneAnalyticsEvents.eventAt} else null end)`,
      lastMaintenanceFailureAt:
        sql<Date | null>`max(case when ${fastlaneAnalyticsEvents.eventName} in (${failureListSql}) then ${fastlaneAnalyticsEvents.eventAt} else null end)`,
    })
    .from(fastlaneAnalyticsEvents)
    .limit(1);

  const row = rows[0];
  return {
    maintenanceActionSuccessCount: row?.maintenanceActionSuccessCount ?? 0,
    maintenanceActionFailureCount: row?.maintenanceActionFailureCount ?? 0,
    lastMaintenanceSuccessAt: row?.lastMaintenanceSuccessAt?.toISOString() ?? null,
    lastMaintenanceFailureAt: row?.lastMaintenanceFailureAt?.toISOString() ?? null,
    byRoute: {
      replay: {
        successCount: row?.replaySuccessCount ?? 0,
        failureCount: row?.replayFailureCount ?? 0,
        lastEventAt: row?.replayLastEventAt?.toISOString() ?? null,
      },
      throttle: {
        successCount: row?.throttleSuccessCount ?? 0,
        failureCount: row?.throttleFailureCount ?? 0,
        lastEventAt: row?.throttleLastEventAt?.toISOString() ?? null,
      },
      run: {
        successCount: row?.runSuccessCount ?? 0,
        failureCount: row?.runFailureCount ?? 0,
        lastEventAt: row?.runLastEventAt?.toISOString() ?? null,
      },
    },
  };
}
