import { describe, expect, it } from 'vitest';
import {
  ADMIN_OPERATOR_STORAGE_KEY,
  ADMIN_TOKEN_STORAGE_KEY,
  READINESS_PREF_LAST_ACTION_STORAGE_KEY,
  READINESS_PREF_UPDATED_AT_STORAGE_KEY,
  READINESS_STALE_FIRST_STORAGE_KEY,
  SNAPSHOT_WINDOW_DAYS_STORAGE_KEY,
} from '@/lib/fastlane/admin-session-storage';
import {
  TELEMETRY_PREFERENCE_COOLDOWN_HELPER_COPY,
  TELEMETRY_PREFERENCE_RESET_BUTTON_LABEL,
  TELEMETRY_PREFERENCE_RESET_HELPER_COPY,
  TELEMETRY_PREFERENCE_ACTION_PREFIX,
  TELEMETRY_PREFERENCE_STATUS_CUSTOMIZED,
  TELEMETRY_PREFERENCE_STATUS_DEFAULT,
  TELEMETRY_PREFERENCE_STATUS_LABEL,
  TELEMETRY_PREFERENCE_UPDATED_PREFIX,
} from '@/lib/fastlane/telemetry-preference-copy';
import {
  ADMIN_KPI_DAY_RANGE,
  ADMIN_MAINTENANCE_BATCH_LIMIT,
  ADMIN_OVERVIEW_DEFAULT_WINDOW_DAYS,
  ADMIN_OVERVIEW_WINDOW_OPTIONS,
  ADMIN_READINESS_RETENTION_RANGE,
  ADMIN_WEBHOOK_LIMIT_RANGE,
} from '@/lib/fastlane/admin-ui-config';
import {
  ADMIN_ACTION_LABELS,
  ADMIN_COMMON_COPY,
  ADMIN_ERROR_COPY,
  ADMIN_FIELD_LABELS,
  ADMIN_HELPER_COPY,
  ADMIN_KPI_COPY,
  ADMIN_OVERVIEW_COPY,
  ADMIN_PLACEHOLDER_COPY,
  ADMIN_READINESS_COPY,
  ADMIN_TABLE_LABELS,
  ADMIN_WEBHOOK_COPY,
  getAdminApiFallbackError,
  getAdminSessionAuthStatusCopy,
} from '@/lib/fastlane/admin-ui-copy';

describe('admin/session storage constants', () => {
  it('keeps storage keys stable', () => {
    expect(ADMIN_TOKEN_STORAGE_KEY).toBe('fastlane.admin.token');
    expect(ADMIN_OPERATOR_STORAGE_KEY).toBe('fastlane.admin.operator');
    expect(SNAPSHOT_WINDOW_DAYS_STORAGE_KEY).toBe('fastlane.admin.snapshot.window_days');
    expect(READINESS_STALE_FIRST_STORAGE_KEY).toBe('fastlane.admin.readiness.stale_first');
    expect(READINESS_PREF_UPDATED_AT_STORAGE_KEY).toBe('fastlane.admin.readiness.pref_updated_at');
    expect(READINESS_PREF_LAST_ACTION_STORAGE_KEY).toBe('fastlane.admin.readiness.pref_last_action');
  });
});

describe('telemetry preference copy constants', () => {
  it('keeps status and helper copy stable', () => {
    expect(TELEMETRY_PREFERENCE_STATUS_DEFAULT).toBe('Default');
    expect(TELEMETRY_PREFERENCE_STATUS_CUSTOMIZED).toBe('Customized');
    expect(TELEMETRY_PREFERENCE_STATUS_LABEL).toBe('Preferences status:');
    expect(TELEMETRY_PREFERENCE_UPDATED_PREFIX).toBe('Preferences updated:');
    expect(TELEMETRY_PREFERENCE_ACTION_PREFIX).toBe('Action:');
    expect(TELEMETRY_PREFERENCE_RESET_BUTTON_LABEL).toBe('Reset telemetry preferences');
    expect(TELEMETRY_PREFERENCE_RESET_HELPER_COPY).toBe(
      'Reset restores default route ordering and clears this page session preference.',
    );
    expect(TELEMETRY_PREFERENCE_COOLDOWN_HELPER_COPY).toBe(
      'Preference update notifications are rate-limited to one update every 0.75 seconds.',
    );
  });
});

describe('admin UI action labels', () => {
  it('keeps shared action labels stable', () => {
    expect(ADMIN_ACTION_LABELS).toEqual({
      login: 'Login',
      logout: 'Logout',
      saveToken: 'Save token',
      clearToken: 'Clear token',
      reprocess: 'Reprocess',
      clearSavedToken: 'Clear saved token',
      loadKpi: 'Load KPI',
      loadFailedEvents: 'Load failed events',
      reprocessBatch: 'Reprocess batch',
      refreshSnapshot: 'Refresh snapshot',
      refreshReadiness: 'Refresh readiness',
      replayCleanupDryRun: 'Replay cleanup dry-run',
      purgeExpiredReplayMarkers: 'Purge expired replay markers',
      throttleCleanupDryRun: 'Throttle cleanup dry-run',
      purgeStaleThrottleRows: 'Purge stale throttle rows',
      runAllMaintenanceDryRun: 'Run all maintenance dry-run',
      runAllMaintenanceNow: 'Run all maintenance now',
    });
  });
});

describe('admin UI shared copy helpers', () => {
  it('keeps field labels and helper copy stable', () => {
    expect(ADMIN_FIELD_LABELS).toEqual({
      adminToken: 'Admin token (CRON_SECRET)',
      webhookOperatorId: 'Operator id (for replay audit)',
    });
    expect(ADMIN_ERROR_COPY).toEqual({
      enterTokenFirst: 'Enter an admin token first.',
      loginFailed: 'Login failed',
      failedToLoadReadiness: 'Failed to load readiness',
      replayCleanupFailed: 'Replay cleanup failed',
      throttleCleanupFailed: 'Throttle cleanup failed',
      maintenanceRunFailed: 'Maintenance run failed',
      snapshotFailed: 'Snapshot failed',
      failedToLoadKpi: 'Failed to load KPI',
      failedToFetch: 'Failed to fetch',
      reprocessFailed: 'Reprocess failed',
    });
    expect(ADMIN_HELPER_COPY.webhookSessionStorage).toBe(
      'Token is stored only in sessionStorage for this browser tab. Reprocess/list calls now use the httpOnly admin session cookie.',
    );
    expect(ADMIN_COMMON_COPY).toEqual({
      notAvailable: 'n/a',
      dash: '-',
      ok: 'ok',
      failed: 'failed',
      countPrefix: 'count:',
      byPrefix: 'by:',
      atPrefix: 'at:',
    });
    expect(ADMIN_PLACEHOLDER_COPY).toEqual({
      token: 'Enter token',
      bearerToken: 'Enter Bearer token',
      webhookOperator: 'ops-admin',
    });
    expect(ADMIN_TABLE_LABELS).toEqual({
      count: 'Count',
      event: 'Event',
      status: 'Status',
      error: 'Error',
      stripeEvent: 'Stripe Event',
      type: 'Type',
      replayAudit: 'Replay Audit',
      created: 'Created',
      action: 'Action',
    });
    expect(ADMIN_WEBHOOK_COPY).toEqual({
      heading: 'FastLane Webhook Recovery Console',
      subheading: 'Admin tooling for listing failed Stripe webhook events and replaying them safely.',
      queryLimitLabel: 'Query limit',
      noFailedEventsLoaded: 'No failed events loaded.',
      lastReprocessResultHeading: 'Last Reprocess Result',
      noReprocessRunYet: 'No reprocess run yet.',
      reprocessedLabel: 'Reprocessed:',
      succeededLabel: 'Succeeded:',
      failedLabel: 'Failed:',
    });
    expect(ADMIN_KPI_COPY).toEqual({
      heading: 'FastLane KPI Dashboard',
      subheading: 'Track conversion, activation, and paywall performance over rolling windows.',
      rollingWindowDaysLabel: 'Rolling window (days)',
      metricTotalEvents: 'Total events',
      sectionConversionFunnel: 'Conversion Funnel',
      sectionTopEvents: 'Top Events',
      sectionAuthHealth: 'Auth Health',
      funnelStepHeader: 'Step',
      funnelConversionHeader: 'Conversion',
      funnelLandingCta: 'Landing CTA',
      funnelSignupStarted: 'Signup Started',
      funnelOnboardingCompleted: 'Onboarding Completed',
      funnelFirstFastStarted: 'First Fast Started',
      funnelFirstFastCompleted: 'First Fast Completed',
      funnelTrialStarted: 'Trial Started',
      metricUniqueIdentifiedUsers: 'Unique identified users',
      metricPaywallToTrial: 'Paywall to Trial',
      metricAccountLinkRate: 'Account Link Rate',
      authTotalUsers: 'Total users',
      authLinkedUsers: 'Linked users',
      authLinkedUserRate: 'Linked user rate',
    });
    expect(ADMIN_READINESS_COPY).toEqual({
      heading: 'FastLane Readiness Console',
      subheading: 'Operational readiness snapshot including production config checks and webhook backlog.',
      maintenanceTelemetrySubheading:
        'Maintenance telemetry tracks admin maintenance actions only: successes are completed jobs, failures are server-side execution errors.',
      maintenanceDryRunMode: 'Dry run',
      maintenanceCleanupMode: 'Cleanup',
      throttleDryRunMode: 'Throttle dry run',
      throttleCleanupMode: 'Throttle cleanup',
      allMaintenanceDryRunMode: 'All maintenance dry run',
      allMaintenanceCleanupMode: 'All maintenance cleanup',
      throttleRetentionDaysLabel: 'Throttle retention days',
      metricOverallStatus: 'Overall status',
      metricFailedWebhookEvents: 'Failed webhook events',
      metricLinkedAccounts: 'Linked accounts',
      metricLoginReplayMarkers: 'Login replay markers (active/expired)',
      metricBillingRiskSubscriptions: 'Billing risk subscriptions',
      metricScheduledCancellations: 'Scheduled cancellations',
      metricOldestFailedWebhookAgeMinutes: 'Oldest failed webhook age (min)',
      metricAuthThrottleRows: 'Auth throttle rows (active/stale)',
      metricMaintenanceActions: 'Maintenance actions (success/failure)',
      metricMaintenanceActionsTooltip: 'Count of successful and failed admin maintenance actions.',
      metricLastMaintenanceRun: 'Last maintenance run (success/failure)',
      metricLastMaintenanceRunTooltip: 'Most recent successful and failed admin maintenance action timestamps.',
      sectionMaintenanceRouteTelemetry: 'Maintenance Route Telemetry',
      maintenanceRouteHeader: 'Route',
      maintenanceSuccessHeader: 'Success',
      maintenanceFailureHeader: 'Failure',
      maintenanceFreshnessHeader: 'Freshness',
      freshnessLegend: 'Freshness legend: fresh <60m, stale >=60m or unknown.',
      staleFirstOrdering: 'Stale first ordering',
      sectionReadinessChecks: 'Readiness Checks',
      readinessCheckHeader: 'Check',
      readinessStatusHeader: 'Status',
      checkDatabaseConfigured: 'Database configured',
      checkAuthConfigured: 'Auth configured',
      checkAuthEmailConfigured: 'Auth email configured',
      checkBillingConfigured: 'Billing configured',
      checkSentryServerDsn: 'Sentry server DSN',
      checkSentryClientDsn: 'Sentry client DSN',
      checkAlertsRoutingConfigured: 'Alert routing configured',
      checkReadyForProduction: 'Ready for production',
      statusOk: 'ok',
      statusMissing: 'missing',
      statusYes: 'yes',
      statusNotYet: 'not yet',
      snapshotPrefix: 'Snapshot:',
    });
    expect(ADMIN_OVERVIEW_COPY).toEqual({
      ariaLabel: 'Live operations snapshot',
      heading: 'Live Operations Snapshot',
      subheading: 'Pulls latest readiness and 7-day KPI signals for rapid ops triage.',
      telemetryLegend:
        'Maintenance telemetry counts admin maintenance endpoint outcomes only: successes are completed jobs, failures are server-side execution errors.',
      healthLegendPrefix: 'Health legend:',
      healthHealthy: 'healthy',
      healthHealthyDetail: 'no active failure trend',
      healthWarning: 'warning',
      healthWarningDetail: 'latest signal is failure',
      healthUnknown: 'unknown',
      healthUnknownDetail: 'no telemetry yet',
      kpiWindowDaysLabel: 'KPI window (days)',
      lastRefreshedPrefix: 'Last refreshed:',
      maintenanceHealthChangedPrefix: 'Maintenance health changed:',
      nextActionPrefix: 'Next action:',
      openReadinessActions: 'Open readiness actions',
      sourceFreshnessLabel: 'Source freshness',
      readinessStatusLabel: 'Readiness Status',
      failedWebhooksLabel: 'Failed Webhooks',
      lastMaintenanceHealthLabel: 'Last Maintenance Health',
      routeFailuresLabel: 'Route Failures (R/T/U)',
      worstFailureRouteLabel: 'Worst Failure Route',
      worstFailureRouteNone: 'none',
      lastTelemetryUpdateLabel: 'Last Telemetry Update',
      notAvailable: 'n/a',
      telemetryFreshnessPrefix: 'Freshness:',
      maintenanceActionsLabel: 'Maintenance Actions (S/F)',
      maintenanceActionsTooltip: 'S/F = successful/failed admin maintenance actions recorded by server telemetry.',
      lastMaintenanceLabel: 'Last Maintenance (S/F)',
      lastMaintenanceTooltip: 'Last timestamps for successful and failed admin maintenance actions.',
      paywallToTrialPrefix: 'Paywall to Trial',
      trialStartsPrefix: 'Trial Starts',
      onboardingCompletionsPrefix: 'Onboarding Completions',
      snapshotTimeLabel: 'Snapshot Time',
      worstHintReplayAction: 'Run replay cleanup dry-run',
      worstHintReplayDetail: 'Highest failures on replay cleanup route.',
      worstHintThrottleAction: 'Run throttle cleanup dry-run',
      worstHintThrottleDetail: 'Highest failures on throttle cleanup route.',
      worstHintRunAction: 'Run unified maintenance dry-run',
      worstHintRunDetail: 'Highest failures on unified run route.',
      worstHintNoneAction: 'No immediate route action required',
      worstHintNoneDetail: 'No route-specific failure concentration detected.',
    });
  });

  it('returns stable session auth status copy', () => {
    expect(getAdminSessionAuthStatusCopy(true)).toBe('Session auth is active.');
    expect(getAdminSessionAuthStatusCopy(false)).toBe('Session auth is inactive.');
    expect(getAdminApiFallbackError('Snapshot failed', 500)).toBe('Snapshot failed (500)');
  });
});

describe('admin UI config constants', () => {
  it('keeps range and option constants stable', () => {
    expect(ADMIN_OVERVIEW_WINDOW_OPTIONS).toEqual([7, 14, 30, 60]);
    expect(ADMIN_OVERVIEW_DEFAULT_WINDOW_DAYS).toBe(7);
    expect(ADMIN_KPI_DAY_RANGE).toEqual({
      min: 1,
      max: 90,
      fallback: 30,
    });
    expect(ADMIN_WEBHOOK_LIMIT_RANGE).toEqual({
      min: 1,
      max: 100,
      fallback: 25,
    });
    expect(ADMIN_READINESS_RETENTION_RANGE).toEqual({
      min: 1,
      max: 365,
      fallback: 30,
    });
    expect(ADMIN_MAINTENANCE_BATCH_LIMIT).toBe(1000);
  });
});
