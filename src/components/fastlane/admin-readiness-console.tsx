'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './admin-readiness-console.module.css';
import { getAdminCsrfTokenFromCookie, useAdminAuth } from './use-admin-auth';
import {
  ADMIN_TOKEN_STORAGE_KEY,
  READINESS_PREF_LAST_ACTION_STORAGE_KEY,
  READINESS_PREF_UPDATED_AT_STORAGE_KEY,
  READINESS_STALE_FIRST_STORAGE_KEY,
} from '@/lib/fastlane/admin-session-storage';
import {
  TELEMETRY_PREFERENCE_ACTION_PREFIX,
  TELEMETRY_PREFERENCE_COOLDOWN_HELPER_COPY,
  TELEMETRY_PREFERENCE_RESET_BUTTON_LABEL,
  TELEMETRY_PREFERENCE_RESET_HELPER_COPY,
  TELEMETRY_PREFERENCE_STATUS_CUSTOMIZED,
  TELEMETRY_PREFERENCE_STATUS_DEFAULT,
  TELEMETRY_PREFERENCE_STATUS_LABEL,
  TELEMETRY_PREFERENCE_UPDATED_PREFIX,
} from '@/lib/fastlane/telemetry-preference-copy';
import {
  ADMIN_MAINTENANCE_BATCH_LIMIT,
  ADMIN_READINESS_RETENTION_RANGE,
} from '@/lib/fastlane/admin-ui-config';
import {
  ADMIN_ACTION_LABELS,
  ADMIN_COMMON_COPY,
  ADMIN_ERROR_COPY,
  ADMIN_FIELD_LABELS,
  ADMIN_READINESS_COPY,
  ADMIN_PLACEHOLDER_COPY,
  getAdminApiFallbackError,
  getAdminSessionAuthStatusCopy,
} from '@/lib/fastlane/admin-ui-copy';
import { createMaintenanceRouteRows } from '@/lib/fastlane/maintenance-route-telemetry';
import { shouldWriteTelemetryPreferenceUpdate } from '@/lib/fastlane/telemetry-preference-cooldown';

interface AdminReadinessResponse {
  status: 'ready' | 'degraded' | 'staging';
  timestamp: string;
  readiness: {
    databaseConfigured: boolean;
    authConfigured: boolean;
    authEmailConfigured: boolean;
    billingConfigured: boolean;
    monitoring: {
      sentryServerDsnConfigured: boolean;
      sentryClientDsnConfigured: boolean;
      alertsRoutingConfigured: boolean;
      readyForProduction: boolean;
    };
    readyForProduction: boolean;
  };
  operations: {
    failedWebhookEvents: number;
    linkedAccounts: number;
    activeLoginReplayMarkers: number;
    expiredLoginReplayMarkers: number;
    billingAtRiskSubscriptions: number;
    scheduledCancellations: number;
    oldestFailedWebhookAgeMinutes: number;
    authThrottleActiveRows: number;
    authThrottleStaleRows: number;
    maintenanceActionSuccessCount: number;
    maintenanceActionFailureCount: number;
    lastMaintenanceSuccessAt: string | null;
    lastMaintenanceFailureAt: string | null;
    maintenanceReplaySuccessCount: number;
    maintenanceReplayFailureCount: number;
    maintenanceReplayLastEventAt: string | null;
    maintenanceThrottleSuccessCount: number;
    maintenanceThrottleFailureCount: number;
    maintenanceThrottleLastEventAt: string | null;
    maintenanceRunSuccessCount: number;
    maintenanceRunFailureCount: number;
    maintenanceRunLastEventAt: string | null;
  };
}

const TELEMETRY_PREF_WRITE_COOLDOWN_MS = 750;

function statusClassName(status: string): string {
  if (status === 'ready') return styles.ok;
  if (status === 'degraded') return styles.error;
  return styles.warn;
}

export function AdminReadinessConsole() {
  const { token, setToken, authenticated, login, logout } = useAdminAuth(ADMIN_TOKEN_STORAGE_KEY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminReadinessResponse | null>(null);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(null);
  const [throttleRetentionDays, setThrottleRetentionDays] = useState<number>(ADMIN_READINESS_RETENTION_RANGE.fallback);
  const [staleFirstTelemetry, setStaleFirstTelemetry] = useState(false);
  const [telemetryPrefUpdatedAt, setTelemetryPrefUpdatedAt] = useState<string | null>(null);
  const [telemetryPrefLastAction, setTelemetryPrefLastAction] = useState<'toggle' | 'reset' | null>(null);
  const lastTelemetryPrefWriteAtRef = useRef<number>(0);

  useEffect(() => {
    const stored = sessionStorage.getItem(READINESS_STALE_FIRST_STORAGE_KEY);
    if (stored === '1') {
      setStaleFirstTelemetry(true);
    }
    const storedUpdatedAt = sessionStorage.getItem(READINESS_PREF_UPDATED_AT_STORAGE_KEY);
    if (storedUpdatedAt) {
      setTelemetryPrefUpdatedAt(storedUpdatedAt);
    }
    const storedLastAction = sessionStorage.getItem(READINESS_PREF_LAST_ACTION_STORAGE_KEY);
    if (storedLastAction === 'toggle' || storedLastAction === 'reset') {
      setTelemetryPrefLastAction(storedLastAction);
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(READINESS_STALE_FIRST_STORAGE_KEY, staleFirstTelemetry ? '1' : '0');
  }, [staleFirstTelemetry]);

  const markTelemetryPreferenceUpdated = (action: 'toggle' | 'reset') => {
    const nowMs = Date.now();
    setTelemetryPrefLastAction(action);
    sessionStorage.setItem(READINESS_PREF_LAST_ACTION_STORAGE_KEY, action);
    if (!shouldWriteTelemetryPreferenceUpdate({
      lastWriteAtMs: lastTelemetryPrefWriteAtRef.current,
      nowMs,
      cooldownMs: TELEMETRY_PREF_WRITE_COOLDOWN_MS,
    })) {
      return;
    }
    lastTelemetryPrefWriteAtRef.current = nowMs;
    const nowIso = new Date(nowMs).toISOString();
    setTelemetryPrefUpdatedAt(nowIso);
    sessionStorage.setItem(READINESS_PREF_UPDATED_AT_STORAGE_KEY, nowIso);
  };

  const onStaleFirstTelemetryChange = (checked: boolean) => {
    setStaleFirstTelemetry(checked);
    markTelemetryPreferenceUpdated('toggle');
  };

  const loginWithState = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await login();
      if (!result.ok) {
        throw new Error(result.error ?? ADMIN_ERROR_COPY.loginFailed);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const logoutWithState = async () => {
    setLoading(true);
    setError(null);
    try {
      await logout();
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    if (!token && !authenticated) {
      setError(ADMIN_ERROR_COPY.enterTokenFirst);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/fastlane/readiness');
      const body = (await res.json()) as AdminReadinessResponse & { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? getAdminApiFallbackError(ADMIN_ERROR_COPY.failedToLoadReadiness, res.status));
      }
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const runReplayCleanup = async (dryRun: boolean) => {
    if (!token && !authenticated) {
      setError(ADMIN_ERROR_COPY.enterTokenFirst);
      return;
    }
    setLoading(true);
    setError(null);
    setMaintenanceMessage(null);
    try {
      const csrfToken = getAdminCsrfTokenFromCookie();
      const res = await fetch('/api/admin/fastlane/maintenance/auth-replay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-fastlane-admin-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ dryRun, limit: ADMIN_MAINTENANCE_BATCH_LIMIT }),
      });
      const body = (await res.json()) as {
        error?: string;
        scanned?: number;
        deleted?: number;
        dryRun?: boolean;
      };
      if (!res.ok) {
        throw new Error(body.error ?? getAdminApiFallbackError(ADMIN_ERROR_COPY.replayCleanupFailed, res.status));
      }
      const mode = body.dryRun
        ? ADMIN_READINESS_COPY.maintenanceDryRunMode
        : ADMIN_READINESS_COPY.maintenanceCleanupMode;
      setMaintenanceMessage(`${mode}: scanned ${body.scanned ?? 0}, deleted ${body.deleted ?? 0}.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const runThrottleCleanup = async (dryRun: boolean) => {
    if (!token && !authenticated) {
      setError(ADMIN_ERROR_COPY.enterTokenFirst);
      return;
    }
    setLoading(true);
    setError(null);
    setMaintenanceMessage(null);
    try {
      const csrfToken = getAdminCsrfTokenFromCookie();
      const res = await fetch('/api/admin/fastlane/maintenance/auth-request-throttle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-fastlane-admin-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          dryRun,
          limit: ADMIN_MAINTENANCE_BATCH_LIMIT,
          retentionDays: throttleRetentionDays,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        scanned?: number;
        deleted?: number;
        dryRun?: boolean;
        retentionDays?: number;
      };
      if (!res.ok) {
        throw new Error(body.error ?? getAdminApiFallbackError(ADMIN_ERROR_COPY.throttleCleanupFailed, res.status));
      }
      const mode = body.dryRun
        ? ADMIN_READINESS_COPY.throttleDryRunMode
        : ADMIN_READINESS_COPY.throttleCleanupMode;
      setMaintenanceMessage(
        `${mode}: scanned ${body.scanned ?? 0}, deleted ${body.deleted ?? 0}, retention ${body.retentionDays ?? throttleRetentionDays}d.`,
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const runAllMaintenance = async (dryRun: boolean) => {
    if (!token && !authenticated) {
      setError(ADMIN_ERROR_COPY.enterTokenFirst);
      return;
    }
    setLoading(true);
    setError(null);
    setMaintenanceMessage(null);
    try {
      const csrfToken = getAdminCsrfTokenFromCookie();
      const res = await fetch('/api/admin/fastlane/maintenance/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-fastlane-admin-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          dryRun,
          replayLimit: ADMIN_MAINTENANCE_BATCH_LIMIT,
          throttleLimit: ADMIN_MAINTENANCE_BATCH_LIMIT,
          throttleRetentionDays: throttleRetentionDays,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        dryRun?: boolean;
        maintenance?: {
          replay?: { scanned?: number; deleted?: number };
          throttle?: { scanned?: number; deleted?: number };
        };
      };
      if (!res.ok) {
        throw new Error(body.error ?? getAdminApiFallbackError(ADMIN_ERROR_COPY.maintenanceRunFailed, res.status));
      }
      const mode = body.dryRun
        ? ADMIN_READINESS_COPY.allMaintenanceDryRunMode
        : ADMIN_READINESS_COPY.allMaintenanceCleanupMode;
      const replayScanned = body.maintenance?.replay?.scanned ?? 0;
      const replayDeleted = body.maintenance?.replay?.deleted ?? 0;
      const throttleScanned = body.maintenance?.throttle?.scanned ?? 0;
      const throttleDeleted = body.maintenance?.throttle?.deleted ?? 0;
      setMaintenanceMessage(
        `${mode}: replay ${replayScanned}/${replayDeleted}, throttle ${throttleScanned}/${throttleDeleted}, retention ${throttleRetentionDays}d.`,
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const maintenanceRouteRows = data
    ? createMaintenanceRouteRows({
        replay: {
          successCount: data.operations.maintenanceReplaySuccessCount ?? 0,
          failureCount: data.operations.maintenanceReplayFailureCount ?? 0,
          lastEventAt: data.operations.maintenanceReplayLastEventAt,
        },
        throttle: {
          successCount: data.operations.maintenanceThrottleSuccessCount ?? 0,
          failureCount: data.operations.maintenanceThrottleFailureCount ?? 0,
          lastEventAt: data.operations.maintenanceThrottleLastEventAt,
        },
        run: {
          successCount: data.operations.maintenanceRunSuccessCount ?? 0,
          failureCount: data.operations.maintenanceRunFailureCount ?? 0,
          lastEventAt: data.operations.maintenanceRunLastEventAt,
        },
      })
    : [];
  const sortedMaintenanceRouteRows = staleFirstTelemetry
    ? [...maintenanceRouteRows].sort((a, b) => {
        const toneRank = (tone: 'ok' | 'warn' | null) => (tone === 'warn' ? 0 : tone === 'ok' ? 1 : 2);
        const toneDiff = toneRank(a.freshnessTone) - toneRank(b.freshnessTone);
        if (toneDiff !== 0) return toneDiff;
        return a.routeLabel.localeCompare(b.routeLabel);
      })
    : maintenanceRouteRows;
  const telemetryPreferenceStatus = staleFirstTelemetry
    ? TELEMETRY_PREFERENCE_STATUS_CUSTOMIZED
    : TELEMETRY_PREFERENCE_STATUS_DEFAULT;

  const resetTelemetryPreferences = () => {
    setStaleFirstTelemetry(false);
    sessionStorage.removeItem(READINESS_STALE_FIRST_STORAGE_KEY);
    markTelemetryPreferenceUpdated('reset');
  };

  return (
    <div className={styles.shell}>
      <div className={styles.wrap}>
        <h1 className={styles.heading}>{ADMIN_READINESS_COPY.heading}</h1>
        <p className={styles.sub}>{ADMIN_READINESS_COPY.subheading}</p>
        <p className={styles.sub}>{ADMIN_READINESS_COPY.maintenanceTelemetrySubheading}</p>

        <section className={styles.card}>
          <label className={styles.label} htmlFor="admin-token">{ADMIN_FIELD_LABELS.adminToken}</label>
          <input
            id="admin-token"
            className={styles.input}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            type="password"
            placeholder={ADMIN_PLACEHOLDER_COPY.token}
          />

          <div className={styles.buttons}>
            <button className={`${styles.btn} ${styles.primary}`} onClick={loginWithState} disabled={!token || loading}>{ADMIN_ACTION_LABELS.login}</button>
            <button className={`${styles.btn} ${styles.ghost}`} onClick={refresh} disabled={loading}>{ADMIN_ACTION_LABELS.refreshReadiness}</button>
            <button className={`${styles.btn} ${styles.ghost}`} onClick={() => void runReplayCleanup(true)} disabled={loading}>{ADMIN_ACTION_LABELS.replayCleanupDryRun}</button>
            <button className={`${styles.btn} ${styles.ghost}`} onClick={() => void runReplayCleanup(false)} disabled={loading}>{ADMIN_ACTION_LABELS.purgeExpiredReplayMarkers}</button>
            <button className={`${styles.btn} ${styles.ghost}`} onClick={() => void runThrottleCleanup(true)} disabled={loading}>{ADMIN_ACTION_LABELS.throttleCleanupDryRun}</button>
            <button className={`${styles.btn} ${styles.ghost}`} onClick={() => void runThrottleCleanup(false)} disabled={loading}>{ADMIN_ACTION_LABELS.purgeStaleThrottleRows}</button>
            <button className={`${styles.btn} ${styles.ghost}`} onClick={() => void runAllMaintenance(true)} disabled={loading}>{ADMIN_ACTION_LABELS.runAllMaintenanceDryRun}</button>
            <button className={`${styles.btn} ${styles.ghost}`} onClick={() => void runAllMaintenance(false)} disabled={loading}>{ADMIN_ACTION_LABELS.runAllMaintenanceNow}</button>
            <button className={`${styles.btn} ${styles.ghost}`} onClick={logoutWithState} disabled={loading}>{ADMIN_ACTION_LABELS.logout}</button>
          </div>

          <label className={styles.label} htmlFor="throttle-retention-days">{ADMIN_READINESS_COPY.throttleRetentionDaysLabel}</label>
          <input
            id="throttle-retention-days"
            className={styles.input}
            type="number"
            min={ADMIN_READINESS_RETENTION_RANGE.min}
            max={ADMIN_READINESS_RETENTION_RANGE.max}
            value={throttleRetentionDays}
            onChange={(e) =>
              setThrottleRetentionDays(
                Math.max(
                  ADMIN_READINESS_RETENTION_RANGE.min,
                  Math.min(
                    ADMIN_READINESS_RETENTION_RANGE.max,
                    Number(e.target.value) || ADMIN_READINESS_RETENTION_RANGE.fallback,
                  ),
                ),
              )
            }
          />

          <p className={styles.sub}>{getAdminSessionAuthStatusCopy(authenticated)}</p>
          {maintenanceMessage && <p className={styles.sub}>{maintenanceMessage}</p>}
          {error && <p className={styles.error}>{error}</p>}
        </section>

        {data && (
          <>
            <section className={styles.grid}>
              <article className={styles.card}>
                <div className={styles.kpiLabel}>{ADMIN_READINESS_COPY.metricOverallStatus}</div>
                <div className={`${styles.kpiValue} ${statusClassName(data.status)}`}>{data.status.toUpperCase()}</div>
              </article>
              <article className={styles.card}>
                <div className={styles.kpiLabel}>{ADMIN_READINESS_COPY.metricFailedWebhookEvents}</div>
                <div className={`${styles.kpiValue} ${data.operations.failedWebhookEvents > 0 ? styles.warn : styles.ok}`}>
                  {data.operations.failedWebhookEvents}
                </div>
              </article>
              <article className={styles.card}>
                <div className={styles.kpiLabel}>{ADMIN_READINESS_COPY.metricLinkedAccounts}</div>
                <div className={styles.kpiValue}>{data.operations.linkedAccounts}</div>
              </article>
              <article className={styles.card}>
                <div className={styles.kpiLabel}>{ADMIN_READINESS_COPY.metricLoginReplayMarkers}</div>
                <div className={styles.kpiValue}>
                  {data.operations.activeLoginReplayMarkers}/{data.operations.expiredLoginReplayMarkers}
                </div>
              </article>
              <article className={styles.card}>
                <div className={styles.kpiLabel}>{ADMIN_READINESS_COPY.metricBillingRiskSubscriptions}</div>
                <div className={`${styles.kpiValue} ${data.operations.billingAtRiskSubscriptions > 0 ? styles.warn : styles.ok}`}>
                  {data.operations.billingAtRiskSubscriptions}
                </div>
              </article>
              <article className={styles.card}>
                <div className={styles.kpiLabel}>{ADMIN_READINESS_COPY.metricScheduledCancellations}</div>
                <div className={styles.kpiValue}>{data.operations.scheduledCancellations}</div>
              </article>
              <article className={styles.card}>
                <div className={styles.kpiLabel}>{ADMIN_READINESS_COPY.metricOldestFailedWebhookAgeMinutes}</div>
                <div className={styles.kpiValue}>{data.operations.oldestFailedWebhookAgeMinutes}</div>
              </article>
              <article className={styles.card}>
                <div className={styles.kpiLabel}>{ADMIN_READINESS_COPY.metricAuthThrottleRows}</div>
                <div className={styles.kpiValue}>
                  {data.operations.authThrottleActiveRows}/{data.operations.authThrottleStaleRows}
                </div>
              </article>
              <article className={styles.card}>
                <div
                  className={styles.kpiLabel}
                  title={ADMIN_READINESS_COPY.metricMaintenanceActionsTooltip}
                >
                  {ADMIN_READINESS_COPY.metricMaintenanceActions}
                </div>
                <div className={styles.kpiValue}>
                  {data.operations.maintenanceActionSuccessCount ?? 0}/{data.operations.maintenanceActionFailureCount ?? 0}
                </div>
              </article>
              <article className={styles.card}>
                <div
                  className={styles.kpiLabel}
                  title={ADMIN_READINESS_COPY.metricLastMaintenanceRunTooltip}
                >
                  {ADMIN_READINESS_COPY.metricLastMaintenanceRun}
                </div>
                <div className={styles.kpiValue}>
                  {data.operations.lastMaintenanceSuccessAt
                    ? new Date(data.operations.lastMaintenanceSuccessAt).toLocaleString()
                    : ADMIN_COMMON_COPY.notAvailable}
                  {' / '}
                  {data.operations.lastMaintenanceFailureAt
                    ? new Date(data.operations.lastMaintenanceFailureAt).toLocaleString()
                    : ADMIN_COMMON_COPY.notAvailable}
                </div>
              </article>
            </section>

            <section className={styles.card}>
              <h2>{ADMIN_READINESS_COPY.sectionMaintenanceRouteTelemetry}</h2>
              <p className={styles.sub}>
                {ADMIN_READINESS_COPY.freshnessLegend}
              </p>
              <label className={styles.sub}>
                <input
                  type="checkbox"
                  checked={staleFirstTelemetry}
                  onChange={(event) => onStaleFirstTelemetryChange(event.target.checked)}
                />{' '}
                {ADMIN_READINESS_COPY.staleFirstOrdering}
              </label>
              <p className={styles.sub}>
                {TELEMETRY_PREFERENCE_STATUS_LABEL}{' '}
                <span className={staleFirstTelemetry ? styles.warn : styles.ok}>
                  {telemetryPreferenceStatus}
                </span>
              </p>
              <button className={`${styles.btn} ${styles.ghost}`} onClick={resetTelemetryPreferences}>
                {TELEMETRY_PREFERENCE_RESET_BUTTON_LABEL}
              </button>
              <p className={styles.sub}>
                {TELEMETRY_PREFERENCE_RESET_HELPER_COPY}
              </p>
              <p className={styles.sub}>
                {TELEMETRY_PREFERENCE_COOLDOWN_HELPER_COPY}
              </p>
              {telemetryPrefUpdatedAt && (
                <p className={styles.sub} role="status" aria-live="polite" aria-atomic="true">
                  {TELEMETRY_PREFERENCE_UPDATED_PREFIX} {new Date(telemetryPrefUpdatedAt).toLocaleTimeString()}
                  {telemetryPrefLastAction ? ` (${TELEMETRY_PREFERENCE_ACTION_PREFIX} ${telemetryPrefLastAction})` : ''}
                </p>
              )}
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{ADMIN_READINESS_COPY.maintenanceRouteHeader}</th>
                    <th>{ADMIN_READINESS_COPY.maintenanceSuccessHeader}</th>
                    <th>{ADMIN_READINESS_COPY.maintenanceFailureHeader}</th>
                    <th>{ADMIN_READINESS_COPY.maintenanceFreshnessHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMaintenanceRouteRows.map((route) => (
                    <tr key={route.key}>
                      <td>{route.routeLabel}</td>
                      <td>{route.successCount}</td>
                      <td>{route.failureCount}</td>
                      <td>
                        {route.freshnessTone ? (
                          <span className={route.freshnessTone === 'warn' ? styles.warn : styles.ok}>
                            {route.freshnessLabel}
                          </span>
                        ) : route.freshnessLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className={styles.card}>
              <h2>{ADMIN_READINESS_COPY.sectionReadinessChecks}</h2>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{ADMIN_READINESS_COPY.readinessCheckHeader}</th>
                    <th>{ADMIN_READINESS_COPY.readinessStatusHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{ADMIN_READINESS_COPY.checkDatabaseConfigured}</td>
                    <td className={data.readiness.databaseConfigured ? styles.ok : styles.error}>
                      {data.readiness.databaseConfigured ? ADMIN_READINESS_COPY.statusOk : ADMIN_READINESS_COPY.statusMissing}
                    </td>
                  </tr>
                  <tr>
                    <td>{ADMIN_READINESS_COPY.checkAuthConfigured}</td>
                    <td className={data.readiness.authConfigured ? styles.ok : styles.error}>
                      {data.readiness.authConfigured ? ADMIN_READINESS_COPY.statusOk : ADMIN_READINESS_COPY.statusMissing}
                    </td>
                  </tr>
                  <tr>
                    <td>{ADMIN_READINESS_COPY.checkAuthEmailConfigured}</td>
                    <td className={data.readiness.authEmailConfigured ? styles.ok : styles.error}>
                      {data.readiness.authEmailConfigured ? ADMIN_READINESS_COPY.statusOk : ADMIN_READINESS_COPY.statusMissing}
                    </td>
                  </tr>
                  <tr>
                    <td>{ADMIN_READINESS_COPY.checkBillingConfigured}</td>
                    <td className={data.readiness.billingConfigured ? styles.ok : styles.error}>
                      {data.readiness.billingConfigured ? ADMIN_READINESS_COPY.statusOk : ADMIN_READINESS_COPY.statusMissing}
                    </td>
                  </tr>
                  <tr>
                    <td>{ADMIN_READINESS_COPY.checkSentryServerDsn}</td>
                    <td className={data.readiness.monitoring.sentryServerDsnConfigured ? styles.ok : styles.error}>
                      {data.readiness.monitoring.sentryServerDsnConfigured ? ADMIN_READINESS_COPY.statusOk : ADMIN_READINESS_COPY.statusMissing}
                    </td>
                  </tr>
                  <tr>
                    <td>{ADMIN_READINESS_COPY.checkSentryClientDsn}</td>
                    <td className={data.readiness.monitoring.sentryClientDsnConfigured ? styles.ok : styles.error}>
                      {data.readiness.monitoring.sentryClientDsnConfigured ? ADMIN_READINESS_COPY.statusOk : ADMIN_READINESS_COPY.statusMissing}
                    </td>
                  </tr>
                  <tr>
                    <td>{ADMIN_READINESS_COPY.checkAlertsRoutingConfigured}</td>
                    <td className={data.readiness.monitoring.alertsRoutingConfigured ? styles.ok : styles.error}>
                      {data.readiness.monitoring.alertsRoutingConfigured ? ADMIN_READINESS_COPY.statusOk : ADMIN_READINESS_COPY.statusMissing}
                    </td>
                  </tr>
                  <tr>
                    <td>{ADMIN_READINESS_COPY.checkReadyForProduction}</td>
                    <td className={data.readiness.readyForProduction ? styles.ok : styles.warn}>
                      {data.readiness.readyForProduction ? ADMIN_READINESS_COPY.statusYes : ADMIN_READINESS_COPY.statusNotYet}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className={styles.sub}>{ADMIN_READINESS_COPY.snapshotPrefix} {new Date(data.timestamp).toLocaleString()}</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
