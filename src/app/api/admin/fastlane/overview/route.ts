import { NextRequest } from 'next/server';
import { isAdminAuthorized } from '@/lib/utils/admin-session-cookie';
import { GET as getAdminReadiness } from '@/app/api/admin/fastlane/readiness/route';
import { GET as getAdminKpi } from '@/app/api/admin/fastlane/kpi/route';
import { adminNoStoreJson } from '@/lib/fastlane/admin-api-headers';
import {
  DEFAULT_ADMIN_OVERVIEW_DAYS,
  MAX_ADMIN_KPI_DAYS,
} from '@/lib/fastlane/admin-kpi-window';

const DEFAULT_ADMIN_OVERVIEW_UPSTREAM_TIMEOUT_MS = 4000;
type MaintenanceHealth = 'healthy' | 'warning' | 'unknown';
type MaintenanceRouteName = 'replay' | 'throttle' | 'run';

function toPositiveInt(value: string | null): number | null {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function getUpstreamTimeoutMs(): number {
  const fromEnv = process.env.FASTLANE_ADMIN_OVERVIEW_TIMEOUT_MS;
  if (fromEnv === undefined) {
    return DEFAULT_ADMIN_OVERVIEW_UPSTREAM_TIMEOUT_MS;
  }
  const parsed = Number(fromEnv);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_ADMIN_OVERVIEW_UPSTREAM_TIMEOUT_MS;
  }
  return parsed;
}

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getMaintenanceHealth(params: {
  successCount: number;
  failureCount: number;
  lastSuccessAt: string | null | undefined;
  lastFailureAt: string | null | undefined;
}): MaintenanceHealth {
  const { successCount, failureCount, lastSuccessAt, lastFailureAt } = params;
  if (failureCount <= 0 && successCount <= 0) return 'unknown';
  if (failureCount <= 0) return 'healthy';

  const successDate = toDateOrNull(lastSuccessAt);
  const failureDate = toDateOrNull(lastFailureAt);
  if (successDate && failureDate && successDate >= failureDate) {
    return 'healthy';
  }
  return 'warning';
}

function getMaintenanceRouteSummary(operations: {
  maintenanceReplaySuccessCount?: number;
  maintenanceReplayFailureCount?: number;
  maintenanceThrottleSuccessCount?: number;
  maintenanceThrottleFailureCount?: number;
  maintenanceRunSuccessCount?: number;
  maintenanceRunFailureCount?: number;
}) {
  const replay = {
    successCount: operations.maintenanceReplaySuccessCount ?? 0,
    failureCount: operations.maintenanceReplayFailureCount ?? 0,
  };
  const throttle = {
    successCount: operations.maintenanceThrottleSuccessCount ?? 0,
    failureCount: operations.maintenanceThrottleFailureCount ?? 0,
  };
  const run = {
    successCount: operations.maintenanceRunSuccessCount ?? 0,
    failureCount: operations.maintenanceRunFailureCount ?? 0,
  };

  const routes: Array<{ name: MaintenanceRouteName; failureCount: number }> = [
    { name: 'replay', failureCount: replay.failureCount },
    { name: 'throttle', failureCount: throttle.failureCount },
    { name: 'run', failureCount: run.failureCount },
  ];
  const worst = routes.reduce(
    (current, candidate) => (candidate.failureCount > current.failureCount ? candidate : current),
    routes[0],
  );

  return {
    replay,
    throttle,
    run,
    worstFailureRoute: worst.failureCount > 0 ? worst.name : null,
  };
}

function getLastMaintenanceTelemetryAt(params: {
  lastSuccessAt: string | null | undefined;
  lastFailureAt: string | null | undefined;
}): string | null {
  const successDate = toDateOrNull(params.lastSuccessAt);
  const failureDate = toDateOrNull(params.lastFailureAt);
  if (!successDate && !failureDate) return null;
  if (!successDate) return failureDate?.toISOString() ?? null;
  if (!failureDate) return successDate.toISOString();
  return (successDate >= failureDate ? successDate : failureDate).toISOString();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
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
    const parsedDays = daysRaw === null ? DEFAULT_ADMIN_OVERVIEW_DAYS : toPositiveInt(daysRaw);
    if (daysRaw !== null && parsedDays === null) {
      return adminNoStoreJson({ error: 'Invalid days' }, 400);
    }
    if ((parsedDays ?? DEFAULT_ADMIN_OVERVIEW_DAYS) > MAX_ADMIN_KPI_DAYS) {
      return adminNoStoreJson({ error: 'Invalid days' }, 400);
    }
    const days = parsedDays ?? DEFAULT_ADMIN_OVERVIEW_DAYS;

    const readinessUrl = new URL('/api/admin/fastlane/readiness', request.url);
    const kpiUrl = new URL(`/api/admin/fastlane/kpi?days=${days}`, request.url);

    const timeoutMs = getUpstreamTimeoutMs();
    let readinessResponse: Response;
    let kpiResponse: Response;

    try {
      [readinessResponse, kpiResponse] = await Promise.all([
        withTimeout(
          getAdminReadiness(new NextRequest(readinessUrl, { headers: request.headers })),
          timeoutMs,
          'Admin readiness',
        ),
        withTimeout(
          getAdminKpi(new NextRequest(kpiUrl, { headers: request.headers })),
          timeoutMs,
          'Admin KPI',
        ),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('timed out')) {
        return adminNoStoreJson(
          { error: 'Admin overview dependency timed out' },
          504,
        );
      }
      throw error;
    }

    const readinessBody = (await readinessResponse.json()) as {
      status?: string;
      timestamp?: string;
      operations?: {
        failedWebhookEvents?: number;
        maintenanceActionSuccessCount?: number;
        maintenanceActionFailureCount?: number;
        lastMaintenanceSuccessAt?: string | null;
        lastMaintenanceFailureAt?: string | null;
        maintenanceReplaySuccessCount?: number;
        maintenanceReplayFailureCount?: number;
        maintenanceThrottleSuccessCount?: number;
        maintenanceThrottleFailureCount?: number;
        maintenanceRunSuccessCount?: number;
        maintenanceRunFailureCount?: number;
      };
      error?: string;
    };
    const kpiBody = (await kpiResponse.json()) as {
      windowDays?: number;
      funnel?: {
        counts?: {
          onboarding_completed?: number;
          trial_started?: number;
        };
      };
      monetization?: {
        paywallToTrialRate?: number;
      };
      error?: string;
    };

    if (!readinessResponse.ok) {
      return adminNoStoreJson(
        { error: readinessBody.error ?? `Readiness lookup failed (${readinessResponse.status})` },
        readinessResponse.status,
      );
    }

    if (!kpiResponse.ok) {
      return adminNoStoreJson(
        { error: kpiBody.error ?? `KPI lookup failed (${kpiResponse.status})` },
        kpiResponse.status,
      );
    }

    return adminNoStoreJson({
      timestamp: new Date().toISOString(),
      readiness: {
        status: readinessBody.status ?? 'staging',
        failedWebhookEvents: readinessBody.operations?.failedWebhookEvents ?? 0,
        maintenanceActionSuccessCount: readinessBody.operations?.maintenanceActionSuccessCount ?? 0,
        maintenanceActionFailureCount: readinessBody.operations?.maintenanceActionFailureCount ?? 0,
        lastMaintenanceSuccessAt: readinessBody.operations?.lastMaintenanceSuccessAt ?? null,
        lastMaintenanceFailureAt: readinessBody.operations?.lastMaintenanceFailureAt ?? null,
        maintenanceHealth: getMaintenanceHealth({
          successCount: readinessBody.operations?.maintenanceActionSuccessCount ?? 0,
          failureCount: readinessBody.operations?.maintenanceActionFailureCount ?? 0,
          lastSuccessAt: readinessBody.operations?.lastMaintenanceSuccessAt ?? null,
          lastFailureAt: readinessBody.operations?.lastMaintenanceFailureAt ?? null,
        }),
        maintenanceRouteSummary: getMaintenanceRouteSummary(readinessBody.operations ?? {}),
        lastMaintenanceTelemetryAt: getLastMaintenanceTelemetryAt({
          lastSuccessAt: readinessBody.operations?.lastMaintenanceSuccessAt ?? null,
          lastFailureAt: readinessBody.operations?.lastMaintenanceFailureAt ?? null,
        }),
        sourceTimestamp: readinessBody.timestamp ?? null,
      },
      kpi: {
        windowDays: kpiBody.windowDays ?? days,
        paywallToTrialRate: kpiBody.monetization?.paywallToTrialRate ?? 0,
        trialStarted: kpiBody.funnel?.counts?.trial_started ?? 0,
        onboardingCompleted: kpiBody.funnel?.counts?.onboarding_completed ?? 0,
      },
    });
  } catch {
    return adminNoStoreJson({ error: 'Unable to load admin overview' }, 500);
  }
}
