'use client';

import { useEffect, useState } from 'react';
import styles from './admin-webhook-console.module.css';
import { getAdminCsrfTokenFromCookie, useAdminAuth } from './use-admin-auth';
import {
  ADMIN_OPERATOR_STORAGE_KEY,
  ADMIN_TOKEN_STORAGE_KEY,
} from '@/lib/fastlane/admin-session-storage';
import { ADMIN_WEBHOOK_LIMIT_RANGE } from '@/lib/fastlane/admin-ui-config';
import {
  ADMIN_ACTION_LABELS,
  ADMIN_COMMON_COPY,
  ADMIN_ERROR_COPY,
  ADMIN_FIELD_LABELS,
  ADMIN_HELPER_COPY,
  ADMIN_PLACEHOLDER_COPY,
  ADMIN_TABLE_LABELS,
  ADMIN_WEBHOOK_COPY,
  getAdminApiFallbackError,
  getAdminSessionAuthStatusCopy,
} from '@/lib/fastlane/admin-ui-copy';

interface FailedEvent {
  id: string;
  stripeEventId: string;
  eventType: string;
  error: string | null;
  replayCount: number;
  lastReplayAt: string | null;
  lastReplayedBy: string | null;
  createdAt: string;
}

interface ReprocessResult {
  reprocessed: number;
  succeeded: number;
  failed: number;
  details: Array<{ stripeEventId: string; ok: boolean; error?: string }>;
}

export function AdminWebhookConsole() {
  const { token, setToken, authenticated, saveToken, clearSavedToken, login, logout } = useAdminAuth(ADMIN_TOKEN_STORAGE_KEY);
  const [failedEvents, setFailedEvents] = useState<FailedEvent[]>([]);
  const [limit, setLimit] = useState<number>(ADMIN_WEBHOOK_LIMIT_RANGE.fallback);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReprocessResult | null>(null);
  const [operator, setOperator] = useState<string>(ADMIN_PLACEHOLDER_COPY.webhookOperator);

  useEffect(() => {
    const savedOperator = sessionStorage.getItem(ADMIN_OPERATOR_STORAGE_KEY);
    if (savedOperator) setOperator(savedOperator);
  }, []);

  const saveTokenAndOperator = () => {
    saveToken();
    sessionStorage.setItem(ADMIN_OPERATOR_STORAGE_KEY, operator);
  };

  const clearTokenAndOperator = () => {
    clearSavedToken();
    sessionStorage.removeItem(ADMIN_OPERATOR_STORAGE_KEY);
    setOperator(ADMIN_PLACEHOLDER_COPY.webhookOperator);
  };

  const loginWithState = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await login();
      if (!result.ok) {
        throw new Error(result.error ?? ADMIN_ERROR_COPY.loginFailed);
      }
      saveTokenAndOperator();
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
      sessionStorage.removeItem(ADMIN_OPERATOR_STORAGE_KEY);
      setOperator(ADMIN_PLACEHOLDER_COPY.webhookOperator);
    } finally {
      setLoading(false);
    }
  };

  const loadFailed = async () => {
    if (!token && !authenticated) {
      setError(ADMIN_ERROR_COPY.enterTokenFirst);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/admin/fastlane/webhook/reprocess?limit=${limit}`, {
        method: 'GET',
      });
      const body = (await res.json()) as { failedEvents?: FailedEvent[]; error?: string };

      if (!res.ok) {
        throw new Error(body.error ?? getAdminApiFallbackError(ADMIN_ERROR_COPY.failedToFetch, res.status));
      }

      setFailedEvents(body.failedEvents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const reprocess = async (stripeEventId?: string) => {
    if (!token && !authenticated) {
      setError(ADMIN_ERROR_COPY.enterTokenFirst);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const csrfToken = getAdminCsrfTokenFromCookie();
      const res = await fetch('/api/admin/fastlane/webhook/reprocess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-fastlane-admin-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify(
          stripeEventId
            ? { stripeEventId, replayedBy: operator }
            : { limit, replayedBy: operator },
        ),
      });

      const body = (await res.json()) as ReprocessResult & { error?: string };

      if (!res.ok) {
        throw new Error(body.error ?? getAdminApiFallbackError(ADMIN_ERROR_COPY.reprocessFailed, res.status));
      }

      setResult(body);
      await loadFailed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.shell}>
      <div className={styles.wrap}>
        <h1 className={styles.heading}>{ADMIN_WEBHOOK_COPY.heading}</h1>
        <p className={styles.sub}>{ADMIN_WEBHOOK_COPY.subheading}</p>

        <section className={styles.card}>
          <label className={styles.label} htmlFor="admin-token">
            {ADMIN_FIELD_LABELS.adminToken}
          </label>
          <input
            id="admin-token"
            className={styles.input}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            type="password"
            placeholder={ADMIN_PLACEHOLDER_COPY.bearerToken}
          />
          <div className={`${styles.buttons}`}>
            <button className={`${styles.btn} ${styles.primary}`} onClick={saveTokenAndOperator} disabled={!token || loading}>
              {ADMIN_ACTION_LABELS.saveToken}
            </button>
            <button className={`${styles.btn} ${styles.primary}`} onClick={loginWithState} disabled={!token || loading}>
              {ADMIN_ACTION_LABELS.login}
            </button>
            <button className={`${styles.btn} ${styles.ghost}`} onClick={logoutWithState} disabled={loading}>
              {ADMIN_ACTION_LABELS.logout}
            </button>
            <button className={`${styles.btn} ${styles.ghost}`} onClick={clearTokenAndOperator} disabled={loading}>
              {ADMIN_ACTION_LABELS.clearToken}
            </button>
          </div>
          <label className={styles.label} htmlFor="operator-id">
            {ADMIN_FIELD_LABELS.webhookOperatorId}
          </label>
          <input
            id="operator-id"
            className={styles.input}
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            placeholder={ADMIN_PLACEHOLDER_COPY.webhookOperator}
          />
          <p className={styles.muted}>
            {ADMIN_HELPER_COPY.webhookSessionStorage} {getAdminSessionAuthStatusCopy(authenticated)}
          </p>
        </section>

        <section className={styles.card}>
          <div className={styles.row}>
            <div>
              <label className={styles.label} htmlFor="limit">
                {ADMIN_WEBHOOK_COPY.queryLimitLabel}
              </label>
              <input
                id="limit"
                className={styles.input}
                type="number"
                min={ADMIN_WEBHOOK_LIMIT_RANGE.min}
                max={ADMIN_WEBHOOK_LIMIT_RANGE.max}
                value={limit}
                onChange={(e) =>
                  setLimit(
                    Math.max(
                      ADMIN_WEBHOOK_LIMIT_RANGE.min,
                      Math.min(
                        ADMIN_WEBHOOK_LIMIT_RANGE.max,
                        Number(e.target.value) || ADMIN_WEBHOOK_LIMIT_RANGE.fallback,
                      ),
                    ),
                  )
                }
              />
            </div>
            <div className={styles.buttons}>
              <button className={`${styles.btn} ${styles.primary}`} onClick={loadFailed} disabled={loading}>
                {ADMIN_ACTION_LABELS.loadFailedEvents}
              </button>
              <button className={`${styles.btn} ${styles.ghost}`} onClick={() => reprocess()} disabled={loading || failedEvents.length === 0}>
                {ADMIN_ACTION_LABELS.reprocessBatch}
              </button>
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <table className={styles.table}>
            <thead>
              <tr>
                <th>{ADMIN_TABLE_LABELS.stripeEvent}</th>
                <th>{ADMIN_TABLE_LABELS.type}</th>
                <th>{ADMIN_TABLE_LABELS.error}</th>
                <th>{ADMIN_TABLE_LABELS.replayAudit}</th>
                <th>{ADMIN_TABLE_LABELS.created}</th>
                <th>{ADMIN_TABLE_LABELS.action}</th>
              </tr>
            </thead>
            <tbody>
              {failedEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.muted}>
                    {ADMIN_WEBHOOK_COPY.noFailedEventsLoaded}
                  </td>
                </tr>
              ) : (
                failedEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td>{ev.stripeEventId}</td>
                    <td>{ev.eventType}</td>
                    <td className={styles.error}>{ev.error ?? ADMIN_COMMON_COPY.dash}</td>
                    <td className={styles.muted}>
                      {ADMIN_COMMON_COPY.countPrefix} {ev.replayCount}
                      <br />
                      {ADMIN_COMMON_COPY.byPrefix} {ev.lastReplayedBy ?? ADMIN_COMMON_COPY.dash}
                      <br />
                      {ADMIN_COMMON_COPY.atPrefix} {ev.lastReplayAt
                        ? new Date(ev.lastReplayAt).toLocaleString()
                        : ADMIN_COMMON_COPY.dash}
                    </td>
                    <td>{new Date(ev.createdAt).toLocaleString()}</td>
                    <td>
                      <button
                        className={`${styles.btn} ${styles.ghost}`}
                        onClick={() => reprocess(ev.stripeEventId)}
                        disabled={loading}
                      >
                        {ADMIN_ACTION_LABELS.reprocess}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className={styles.card}>
          <h2>{ADMIN_WEBHOOK_COPY.lastReprocessResultHeading}</h2>
          {!result ? (
            <p className={styles.muted}>{ADMIN_WEBHOOK_COPY.noReprocessRunYet}</p>
          ) : (
            <>
              <p>
                {ADMIN_WEBHOOK_COPY.reprocessedLabel} <strong>{result.reprocessed}</strong> | {ADMIN_WEBHOOK_COPY.succeededLabel}{' '}
                <strong className={styles.ok}>{result.succeeded}</strong> | {ADMIN_WEBHOOK_COPY.failedLabel}{' '}
                <strong className={styles.error}>{result.failed}</strong>
              </p>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{ADMIN_TABLE_LABELS.stripeEvent}</th>
                    <th>{ADMIN_TABLE_LABELS.status}</th>
                    <th>{ADMIN_TABLE_LABELS.error}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.details.map((d) => (
                    <tr key={d.stripeEventId}>
                      <td>{d.stripeEventId}</td>
                      <td className={d.ok ? styles.ok : styles.error}>
                        {d.ok ? ADMIN_COMMON_COPY.ok : ADMIN_COMMON_COPY.failed}
                      </td>
                      <td>{d.error ?? ADMIN_COMMON_COPY.dash}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
