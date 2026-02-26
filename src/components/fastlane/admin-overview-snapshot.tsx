'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './admin-overview-snapshot.module.css';
import { useAdminAuth } from './use-admin-auth';
import {
  ADMIN_TOKEN_STORAGE_KEY,
  SNAPSHOT_WINDOW_DAYS_STORAGE_KEY,
} from '@/lib/fastlane/admin-session-storage';
import {
  ADMIN_OVERVIEW_DEFAULT_WINDOW_DAYS,
  ADMIN_OVERVIEW_WINDOW_OPTIONS,
} from '@/lib/fastlane/admin-ui-config';
import {
  ADMIN_ACTION_LABELS,
  ADMIN_ERROR_COPY,
  ADMIN_FIELD_LABELS,
  ADMIN_OVERVIEW_COPY,
  ADMIN_PLACEHOLDER_COPY,
  getAdminApiFallbackError,
  getAdminSessionAuthStatusCopy,
} from '@/lib/fastlane/admin-ui-copy';
import {
  getCompactTelemetryFreshness,
  getSnapshotFreshness,
} from '@/lib/fastlane/snapshot-freshness';

interface SnapshotData {
  timestamp: string;
  readiness: {
    status: 'ready' | 'degraded' | 'staging';
    failedWebhookEvents: number;
    maintenanceActionSuccessCount: number;
    maintenanceActionFailureCount: number;
    lastMaintenanceSuccessAt: string | null;
    lastMaintenanceFailureAt: string | null;
    maintenanceHealth: 'healthy' | 'warning' | 'unknown';
    maintenanceRouteSummary: {
      replay: { successCount: number; failureCount: number };
      throttle: { successCount: number; failureCount: number };
      run: { successCount: number; failureCount: number };
      worstFailureRoute: 'replay' | 'throttle' | 'run' | null;
    };
    lastMaintenanceTelemetryAt: string | null;
    sourceTimestamp: string | null;
  };
  kpi: {
    windowDays: number;
    paywallToTrialRate: number;
    trialStarted: number;
    onboardingCompleted: number;
  };
}

function statusClassName(status: SnapshotData['readiness']['status']): string {
  if (status === 'ready') return styles.ok;
  if (status === 'degraded') return styles.bad;
  return styles.warn;
}

function maintenanceHealthClassName(status: SnapshotData['readiness']['maintenanceHealth']): string {
  if (status === 'healthy') return styles.ok;
  if (status === 'warning') return styles.warn;
  return styles.bad;
}

function getWorstRouteHint(route: SnapshotData['readiness']['maintenanceRouteSummary']['worstFailureRoute']) {
  if (route === 'replay') {
    return {
      action: ADMIN_OVERVIEW_COPY.worstHintReplayAction,
      detail: ADMIN_OVERVIEW_COPY.worstHintReplayDetail,
    };
  }
  if (route === 'throttle') {
    return {
      action: ADMIN_OVERVIEW_COPY.worstHintThrottleAction,
      detail: ADMIN_OVERVIEW_COPY.worstHintThrottleDetail,
    };
  }
  if (route === 'run') {
    return {
      action: ADMIN_OVERVIEW_COPY.worstHintRunAction,
      detail: ADMIN_OVERVIEW_COPY.worstHintRunDetail,
    };
  }
  return {
    action: ADMIN_OVERVIEW_COPY.worstHintNoneAction,
    detail: ADMIN_OVERVIEW_COPY.worstHintNoneDetail,
  };
}

export function AdminOverviewSnapshot() {
  const { token, setToken, authenticated, login, logout } = useAdminAuth(ADMIN_TOKEN_STORAGE_KEY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [windowDays, setWindowDays] = useState(ADMIN_OVERVIEW_DEFAULT_WINDOW_DAYS);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [maintenanceHealthChange, setMaintenanceHealthChange] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(SNAPSHOT_WINDOW_DAYS_STORAGE_KEY);
    const parsed = stored === null ? NaN : Number(stored);
    if (ADMIN_OVERVIEW_WINDOW_OPTIONS.includes(parsed as (typeof ADMIN_OVERVIEW_WINDOW_OPTIONS)[number])) {
      setWindowDays(parsed);
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(SNAPSHOT_WINDOW_DAYS_STORAGE_KEY, String(windowDays));
  }, [windowDays]);

  const freshness = snapshot
    ? getSnapshotFreshness(snapshot.readiness.sourceTimestamp ?? snapshot.timestamp)
    : null;
  const telemetryFreshness = snapshot?.readiness.lastMaintenanceTelemetryAt
    ? getCompactTelemetryFreshness(snapshot.readiness.lastMaintenanceTelemetryAt)
    : null;
  const worstRouteHint = snapshot
    ? getWorstRouteHint(snapshot.readiness.maintenanceRouteSummary.worstFailureRoute)
    : null;

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
      setSnapshot(null);
      setLastRefreshedAt(null);
      setMaintenanceHealthChange(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshSnapshot = async () => {
    if (!token && !authenticated) {
      setError(ADMIN_ERROR_COPY.enterTokenFirst);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/fastlane/overview?days=${windowDays}`, {
        cache: 'no-store',
      });
      const body = (await response.json()) as SnapshotData & { error?: string };

      if (!response.ok) {
        throw new Error(body.error ?? getAdminApiFallbackError(ADMIN_ERROR_COPY.snapshotFailed, response.status));
      }

      const previousHealth = snapshot?.readiness.maintenanceHealth;
      const nextHealth = body.readiness.maintenanceHealth;
      if (previousHealth && previousHealth !== nextHealth) {
        setMaintenanceHealthChange(
          `${ADMIN_OVERVIEW_COPY.maintenanceHealthChangedPrefix} ${previousHealth} -> ${nextHealth}.`,
        );
      } else {
        setMaintenanceHealthChange(null);
      }

      setSnapshot(body);
      setLastRefreshedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={styles.card} aria-label={ADMIN_OVERVIEW_COPY.ariaLabel}>
      <h2 className={styles.heading}>{ADMIN_OVERVIEW_COPY.heading}</h2>
      <p className={styles.sub}>{ADMIN_OVERVIEW_COPY.subheading}</p>
      <p className={styles.sub}>
        {ADMIN_OVERVIEW_COPY.telemetryLegend}
      </p>
      <p className={styles.sub}>
        {ADMIN_OVERVIEW_COPY.healthLegendPrefix} <span className={styles.ok}>{ADMIN_OVERVIEW_COPY.healthHealthy}</span> ({ADMIN_OVERVIEW_COPY.healthHealthyDetail}),{' '}
        <span className={styles.warn}>{ADMIN_OVERVIEW_COPY.healthWarning}</span> ({ADMIN_OVERVIEW_COPY.healthWarningDetail}),{' '}
        <span className={styles.bad}>{ADMIN_OVERVIEW_COPY.healthUnknown}</span> ({ADMIN_OVERVIEW_COPY.healthUnknownDetail}).
      </p>

      <label className={styles.label} htmlFor="snapshot-admin-token">{ADMIN_FIELD_LABELS.adminToken}</label>
      <input
        id="snapshot-admin-token"
        className={styles.input}
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder={ADMIN_PLACEHOLDER_COPY.token}
      />

      <div className={styles.buttons}>
        <button className={styles.btn} onClick={loginWithState} disabled={!token || loading}>{ADMIN_ACTION_LABELS.login}</button>
        <button className={styles.btn} onClick={refreshSnapshot} disabled={loading}>{ADMIN_ACTION_LABELS.refreshSnapshot}</button>
        <button className={`${styles.btn} ${styles.ghost}`} onClick={logoutWithState} disabled={loading}>{ADMIN_ACTION_LABELS.logout}</button>
      </div>

      <label className={styles.label} htmlFor="snapshot-window-days">{ADMIN_OVERVIEW_COPY.kpiWindowDaysLabel}</label>
      <select
        id="snapshot-window-days"
        className={styles.input}
        value={windowDays}
        onChange={(event) => setWindowDays(Number(event.target.value))}
      >
        {ADMIN_OVERVIEW_WINDOW_OPTIONS.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>

      <p className={styles.status}>{getAdminSessionAuthStatusCopy(authenticated)}</p>
      {lastRefreshedAt && (
        <p className={styles.status}>{ADMIN_OVERVIEW_COPY.lastRefreshedPrefix} {new Date(lastRefreshedAt).toLocaleString()}</p>
      )}
      {maintenanceHealthChange && (
        <p className={styles.status}>{maintenanceHealthChange}</p>
      )}
      {error && <p className={styles.error}>{error}</p>}
      {worstRouteHint && (
        <p className={styles.status}>
          {ADMIN_OVERVIEW_COPY.nextActionPrefix} {worstRouteHint.action}. {worstRouteHint.detail}{' '}
          <Link href="/admin/fastlane/readiness">{ADMIN_OVERVIEW_COPY.openReadinessActions}</Link>
        </p>
      )}

      {snapshot && (
        <div className={styles.metrics}>
          <article className={styles.metric}>
            <div className={styles.metricLabel}>{ADMIN_OVERVIEW_COPY.sourceFreshnessLabel}</div>
            <div className={`${styles.metricValue} ${freshness?.stale ? styles.warn : styles.ok}`}>
              {freshness?.label}
            </div>
          </article>
          <article className={styles.metric}>
            <div className={styles.metricLabel}>{ADMIN_OVERVIEW_COPY.readinessStatusLabel}</div>
            <div className={`${styles.metricValue} ${statusClassName(snapshot.readiness.status)}`}>
              {snapshot.readiness.status.toUpperCase()}
            </div>
          </article>
          <article className={styles.metric}>
            <div className={styles.metricLabel}>{ADMIN_OVERVIEW_COPY.failedWebhooksLabel}</div>
            <div className={`${styles.metricValue} ${snapshot.readiness.failedWebhookEvents > 0 ? styles.warn : styles.ok}`}>
              {snapshot.readiness.failedWebhookEvents}
            </div>
          </article>
          <article className={styles.metric}>
            <div className={styles.metricLabel}>{ADMIN_OVERVIEW_COPY.lastMaintenanceHealthLabel}</div>
            <div className={`${styles.metricValue} ${maintenanceHealthClassName(snapshot.readiness.maintenanceHealth)}`}>
              {snapshot.readiness.maintenanceHealth.toUpperCase()}
            </div>
          </article>
          <article className={styles.metric}>
            <div className={styles.metricLabel}>{ADMIN_OVERVIEW_COPY.routeFailuresLabel}</div>
            <div className={styles.metricValue}>
              {snapshot.readiness.maintenanceRouteSummary.replay.failureCount}/
              {snapshot.readiness.maintenanceRouteSummary.throttle.failureCount}/
              {snapshot.readiness.maintenanceRouteSummary.run.failureCount}
            </div>
          </article>
          <article className={styles.metric}>
            <div className={styles.metricLabel}>{ADMIN_OVERVIEW_COPY.worstFailureRouteLabel}</div>
            <div className={styles.metricValue}>
              {(snapshot.readiness.maintenanceRouteSummary.worstFailureRoute ?? ADMIN_OVERVIEW_COPY.worstFailureRouteNone).toUpperCase()}
            </div>
          </article>
          <article className={styles.metric}>
            <div className={styles.metricLabel}>{ADMIN_OVERVIEW_COPY.lastTelemetryUpdateLabel}</div>
            <div className={styles.metricValue}>
              {snapshot.readiness.lastMaintenanceTelemetryAt
                ? new Date(snapshot.readiness.lastMaintenanceTelemetryAt).toLocaleTimeString()
                : ADMIN_OVERVIEW_COPY.notAvailable}
            </div>
            {telemetryFreshness && (
              <div className={`${styles.metricMeta} ${telemetryFreshness.stale ? styles.warn : styles.ok}`}>
                {ADMIN_OVERVIEW_COPY.telemetryFreshnessPrefix} {telemetryFreshness.label}
              </div>
            )}
          </article>
          <article className={styles.metric}>
            <div
              className={styles.metricLabel}
              title={ADMIN_OVERVIEW_COPY.maintenanceActionsTooltip}
            >
              {ADMIN_OVERVIEW_COPY.maintenanceActionsLabel}
            </div>
            <div className={styles.metricValue}>
              {snapshot.readiness.maintenanceActionSuccessCount}/{snapshot.readiness.maintenanceActionFailureCount}
            </div>
          </article>
          <article className={styles.metric}>
            <div
              className={styles.metricLabel}
              title={ADMIN_OVERVIEW_COPY.lastMaintenanceTooltip}
            >
              {ADMIN_OVERVIEW_COPY.lastMaintenanceLabel}
            </div>
            <div className={styles.metricValue}>
              {snapshot.readiness.lastMaintenanceSuccessAt
                ? new Date(snapshot.readiness.lastMaintenanceSuccessAt).toLocaleTimeString()
                : ADMIN_OVERVIEW_COPY.notAvailable}
              {' / '}
              {snapshot.readiness.lastMaintenanceFailureAt
                ? new Date(snapshot.readiness.lastMaintenanceFailureAt).toLocaleTimeString()
                : ADMIN_OVERVIEW_COPY.notAvailable}
            </div>
          </article>
          <article className={styles.metric}>
            <div className={styles.metricLabel}>{ADMIN_OVERVIEW_COPY.paywallToTrialPrefix} ({snapshot.kpi.windowDays}d)</div>
            <div className={styles.metricValue}>{snapshot.kpi.paywallToTrialRate}%</div>
          </article>
          <article className={styles.metric}>
            <div className={styles.metricLabel}>{ADMIN_OVERVIEW_COPY.trialStartsPrefix} ({snapshot.kpi.windowDays}d)</div>
            <div className={styles.metricValue}>{snapshot.kpi.trialStarted}</div>
          </article>
          <article className={styles.metric}>
            <div className={styles.metricLabel}>{ADMIN_OVERVIEW_COPY.onboardingCompletionsPrefix} ({snapshot.kpi.windowDays}d)</div>
            <div className={styles.metricValue}>{snapshot.kpi.onboardingCompleted}</div>
          </article>
          <article className={styles.metric}>
            <div className={styles.metricLabel}>{ADMIN_OVERVIEW_COPY.snapshotTimeLabel}</div>
            <div className={styles.metricValue}>
              {new Date(snapshot.timestamp).toLocaleTimeString()}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
