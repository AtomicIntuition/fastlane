export const ADMIN_ACTION_LABELS = {
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
} as const;

export const ADMIN_FIELD_LABELS = {
  adminToken: 'Admin token (CRON_SECRET)',
  webhookOperatorId: 'Operator id (for replay audit)',
} as const;

export const ADMIN_ERROR_COPY = {
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
} as const;

export const ADMIN_HELPER_COPY = {
  webhookSessionStorage:
    'Token is stored only in sessionStorage for this browser tab. Reprocess/list calls now use the httpOnly admin session cookie.',
} as const;

export const ADMIN_COMMON_COPY = {
  notAvailable: 'n/a',
  dash: '-',
  ok: 'ok',
  failed: 'failed',
  countPrefix: 'count:',
  byPrefix: 'by:',
  atPrefix: 'at:',
} as const;

export const ADMIN_PLACEHOLDER_COPY = {
  token: 'Enter token',
  bearerToken: 'Enter Bearer token',
  webhookOperator: 'ops-admin',
} as const;

export const ADMIN_TABLE_LABELS = {
  count: 'Count',
  event: 'Event',
  status: 'Status',
  error: 'Error',
  stripeEvent: 'Stripe Event',
  type: 'Type',
  replayAudit: 'Replay Audit',
  created: 'Created',
  action: 'Action',
} as const;

export const ADMIN_WEBHOOK_COPY = {
  heading: 'FastLane Webhook Recovery Console',
  subheading: 'Admin tooling for listing failed Stripe webhook events and replaying them safely.',
  queryLimitLabel: 'Query limit',
  noFailedEventsLoaded: 'No failed events loaded.',
  lastReprocessResultHeading: 'Last Reprocess Result',
  noReprocessRunYet: 'No reprocess run yet.',
  reprocessedLabel: 'Reprocessed:',
  succeededLabel: 'Succeeded:',
  failedLabel: 'Failed:',
} as const;

export const ADMIN_KPI_COPY = {
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
} as const;

export const ADMIN_READINESS_COPY = {
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
} as const;

export const ADMIN_OVERVIEW_COPY = {
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
} as const;

export function getAdminSessionAuthStatusCopy(authenticated: boolean): string {
  return `Session auth is ${authenticated ? 'active' : 'inactive'}.`;
}

export function getAdminApiFallbackError(message: string, status: number): string {
  return `${message} (${status})`;
}
