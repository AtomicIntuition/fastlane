import { getCompactTelemetryFreshness } from '@/lib/fastlane/snapshot-freshness';

export interface MaintenanceRouteTelemetryInput {
  replay: { successCount: number; failureCount: number; lastEventAt: string | null };
  throttle: { successCount: number; failureCount: number; lastEventAt: string | null };
  run: { successCount: number; failureCount: number; lastEventAt: string | null };
}

export interface MaintenanceRouteRowModel {
  key: 'replay' | 'throttle' | 'run';
  routeLabel: string;
  successCount: number;
  failureCount: number;
  freshnessLabel: string;
  freshnessTone: 'ok' | 'warn' | null;
}

export function createMaintenanceRouteRows(
  telemetry: MaintenanceRouteTelemetryInput,
  nowMs: number = Date.now(),
): MaintenanceRouteRowModel[] {
  return [
    { key: 'replay' as const, routeLabel: 'Replay cleanup', ...telemetry.replay },
    { key: 'throttle' as const, routeLabel: 'Throttle cleanup', ...telemetry.throttle },
    { key: 'run' as const, routeLabel: 'Unified run', ...telemetry.run },
  ].map((route) => {
    const freshness = route.lastEventAt
      ? getCompactTelemetryFreshness(route.lastEventAt, nowMs)
      : null;

    return {
      key: route.key,
      routeLabel: route.routeLabel,
      successCount: route.successCount,
      failureCount: route.failureCount,
      freshnessLabel: freshness?.label ?? 'n/a',
      freshnessTone: freshness ? (freshness.stale ? 'warn' : 'ok') : null,
    };
  });
}
