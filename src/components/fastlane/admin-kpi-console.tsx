'use client';

import { useState } from 'react';
import styles from './admin-kpi-console.module.css';
import { useAdminAuth } from './use-admin-auth';
import { ADMIN_TOKEN_STORAGE_KEY } from '@/lib/fastlane/admin-session-storage';
import { ADMIN_KPI_DAY_RANGE } from '@/lib/fastlane/admin-ui-config';
import {
  ADMIN_ACTION_LABELS,
  ADMIN_ERROR_COPY,
  ADMIN_FIELD_LABELS,
  ADMIN_KPI_COPY,
  ADMIN_PLACEHOLDER_COPY,
  ADMIN_TABLE_LABELS,
  getAdminApiFallbackError,
  getAdminSessionAuthStatusCopy,
} from '@/lib/fastlane/admin-ui-copy';

interface KpiResponse {
  windowDays: number;
  since: string;
  totals: {
    totalEvents: number;
    uniqueUsers: number;
  };
  funnel: {
    counts: {
      landing_cta_clicked: number;
      signup_started: number;
      onboarding_completed: number;
      first_fast_started: number;
      first_fast_completed: number;
      trial_started: number;
    };
    rates: {
      ctaToSignup: number;
      signupToOnboarding: number;
      onboardingToFirstFastStart: number;
      startToComplete: number;
      completionToTrial: number;
    };
  };
  monetization: {
    paywallViewed: number;
    trialStarted: number;
    paywallToTrialRate: number;
  };
  auth: {
    totalUsers: number;
    linkedUsers: number;
    linkedUserRate: number;
  };
  topEvents: Array<{ eventName: string; count: number }>;
}

export function AdminKpiConsole() {
  const { token, setToken, authenticated, clearSavedToken, login } = useAdminAuth(ADMIN_TOKEN_STORAGE_KEY);
  const [days, setDays] = useState<number>(ADMIN_KPI_DAY_RANGE.fallback);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<KpiResponse | null>(null);

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

  const load = async () => {
    if (!token && !authenticated) {
      setError(ADMIN_ERROR_COPY.enterTokenFirst);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/fastlane/kpi?days=${days}`);
      const body = (await res.json()) as KpiResponse & { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? getAdminApiFallbackError(ADMIN_ERROR_COPY.failedToLoadKpi, res.status));
      }
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.shell}>
      <div className={styles.wrap}>
        <h1 className={styles.heading}>{ADMIN_KPI_COPY.heading}</h1>
        <p className={styles.sub}>{ADMIN_KPI_COPY.subheading}</p>

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
          <div className={styles.buttons} style={{ marginTop: '0.6rem' }}>
            <button className={`${styles.btn} ${styles.primary}`} onClick={loginWithState} disabled={!token || loading}>{ADMIN_ACTION_LABELS.login}</button>
            <button className={`${styles.btn} ${styles.ghost}`} onClick={clearSavedToken} disabled={loading}>{ADMIN_ACTION_LABELS.clearSavedToken}</button>
          </div>
          <p className={styles.muted} style={{ marginTop: '0.5rem' }}>{getAdminSessionAuthStatusCopy(authenticated)}</p>
        </section>

        <section className={styles.card}>
          <div className={styles.row}>
            <div>
              <label className={styles.label} htmlFor="window-days">{ADMIN_KPI_COPY.rollingWindowDaysLabel}</label>
              <input
                id="window-days"
                className={styles.input}
                type="number"
                min={ADMIN_KPI_DAY_RANGE.min}
                max={ADMIN_KPI_DAY_RANGE.max}
                value={days}
                onChange={(e) =>
                  setDays(
                    Math.max(
                      ADMIN_KPI_DAY_RANGE.min,
                      Math.min(
                        ADMIN_KPI_DAY_RANGE.max,
                        Number(e.target.value) || ADMIN_KPI_DAY_RANGE.fallback,
                      ),
                    ),
                  )
                }
              />
            </div>
            <div className={styles.buttons}>
              <button className={`${styles.btn} ${styles.primary}`} onClick={load} disabled={loading}>{ADMIN_ACTION_LABELS.loadKpi}</button>
            </div>
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </section>

        {data && (
          <>
            <section className={styles.grid}>
              <article className={styles.card}>
                <div className={styles.kpiLabel}>{ADMIN_KPI_COPY.metricTotalEvents} ({data.windowDays}d)</div>
                <div className={styles.kpiValue}>{data.totals.totalEvents}</div>
              </article>
              <article className={styles.card}>
                <div className={styles.kpiLabel}>{ADMIN_KPI_COPY.metricUniqueIdentifiedUsers}</div>
                <div className={styles.kpiValue}>{data.totals.uniqueUsers}</div>
              </article>
              <article className={styles.card}>
                <div className={styles.kpiLabel}>{ADMIN_KPI_COPY.metricPaywallToTrial}</div>
                <div className={styles.kpiValue}>{data.monetization.paywallToTrialRate}%</div>
              </article>
              <article className={styles.card}>
                <div className={styles.kpiLabel}>{ADMIN_KPI_COPY.metricAccountLinkRate}</div>
                <div className={styles.kpiValue}>{data.auth.linkedUserRate}%</div>
              </article>
            </section>

            <section className={styles.card}>
              <h2>{ADMIN_KPI_COPY.sectionConversionFunnel}</h2>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{ADMIN_KPI_COPY.funnelStepHeader}</th>
                    <th>{ADMIN_TABLE_LABELS.count}</th>
                    <th>{ADMIN_KPI_COPY.funnelConversionHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>{ADMIN_KPI_COPY.funnelLandingCta}</td><td>{data.funnel.counts.landing_cta_clicked}</td><td>-</td></tr>
                  <tr><td>{ADMIN_KPI_COPY.funnelSignupStarted}</td><td>{data.funnel.counts.signup_started}</td><td>{data.funnel.rates.ctaToSignup}%</td></tr>
                  <tr><td>{ADMIN_KPI_COPY.funnelOnboardingCompleted}</td><td>{data.funnel.counts.onboarding_completed}</td><td>{data.funnel.rates.signupToOnboarding}%</td></tr>
                  <tr><td>{ADMIN_KPI_COPY.funnelFirstFastStarted}</td><td>{data.funnel.counts.first_fast_started}</td><td>{data.funnel.rates.onboardingToFirstFastStart}%</td></tr>
                  <tr><td>{ADMIN_KPI_COPY.funnelFirstFastCompleted}</td><td>{data.funnel.counts.first_fast_completed}</td><td>{data.funnel.rates.startToComplete}%</td></tr>
                  <tr><td>{ADMIN_KPI_COPY.funnelTrialStarted}</td><td>{data.funnel.counts.trial_started}</td><td>{data.funnel.rates.completionToTrial}%</td></tr>
                </tbody>
              </table>
            </section>

            <section className={styles.card}>
              <h2>{ADMIN_KPI_COPY.sectionTopEvents}</h2>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{ADMIN_TABLE_LABELS.event}</th>
                    <th>{ADMIN_TABLE_LABELS.count}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topEvents.map((event) => (
                    <tr key={event.eventName}>
                      <td>{event.eventName}</td>
                      <td>{event.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className={styles.card}>
              <h2>{ADMIN_KPI_COPY.sectionAuthHealth}</h2>
              <table className={styles.table}>
                <tbody>
                  <tr><td>{ADMIN_KPI_COPY.authTotalUsers}</td><td>{data.auth.totalUsers}</td></tr>
                  <tr><td>{ADMIN_KPI_COPY.authLinkedUsers}</td><td>{data.auth.linkedUsers}</td></tr>
                  <tr><td>{ADMIN_KPI_COPY.authLinkedUserRate}</td><td>{data.auth.linkedUserRate}%</td></tr>
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
