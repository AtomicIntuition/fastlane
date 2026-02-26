'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './fastlane-app.module.css';
import {
  FASTING_PROTOCOLS,
  type FastLaneNotificationPlan,
  type DailyCheckIn,
  type FastLaneState,
  type FastingGoal,
  type ExperienceLevel,
} from '@/lib/fastlane/types';
import {
  calculateCurrentStreak,
  formatDurationMinutes,
  getElapsedMinutes,
  getProgressPercent,
} from '@/lib/fastlane/time';
import { trackEvent, trackWeeklyActive } from '@/lib/fastlane/analytics';
import { formatUsd, getFastLanePlanConfig } from '@/lib/fastlane/pricing';

const DEMO_BASE_TIME = '2026-02-25T08:00:00.000Z';
const DEMO_STATE: FastLaneState = {
  onboarded: false,
  tier: 'free',
  profile: {
    goal: 'energy',
    experience: 'new',
    protocolId: '16_8',
    wakeTime: '07:00',
    sleepTime: '23:00',
    reminders: true,
  },
  activeFastStartAt: null,
  sessions: [],
  checkIns: [],
  flags: {
    firstFastStartedTracked: false,
    firstFastCompletedTracked: false,
    postOnboardingPaywallSeen: false,
  },
};

function isDemoModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const search = new URLSearchParams(window.location.search);
  return search.get('demo') === '1';
}

function getFastLaneCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('fastlaneCsrf='));
  if (!cookie) return null;
  const raw = cookie.slice('fastlaneCsrf='.length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function fetchFastLaneStateEnvelope(): Promise<{ state: FastLaneState; stateVersion: string | null }> {
  const parse = async (response: Response): Promise<{ state: FastLaneState; stateVersion: string | null }> => {
    const payload = (await response.json()) as { state: FastLaneState; stateVersion?: string | null };
    const version = response.headers.get('x-fastlane-state-version') ?? payload.stateVersion ?? null;
    return { state: payload.state, stateVersion: version };
  };

  const res = await fetch('/api/fastlane/state', { cache: 'no-store' });
  if (res.status === 401) {
    await fetch('/api/fastlane/auth/guest', { method: 'POST' });
    const retry = await fetch('/api/fastlane/state', { cache: 'no-store' });
    if (!retry.ok) throw new Error('Failed to fetch state after guest auth bootstrap');
    return parse(retry);
  }
  if (!res.ok) throw new Error('Failed to fetch FastLane state');
  return parse(res);
}

async function resetGuestSession(): Promise<void> {
  const res = await fetch('/api/fastlane/auth/guest', { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to reset session');
}

async function updateFastLaneState(
  payload: Record<string, unknown>,
  stateVersion?: string | null,
): Promise<{ state: FastLaneState; stateVersion: string | null; conflict: boolean }> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const csrfToken = getFastLaneCsrfTokenFromCookie();
  if (csrfToken) {
    headers['x-fastlane-csrf-token'] = csrfToken;
  }
  if (stateVersion) {
    headers['x-fastlane-state-version'] = stateVersion;
  }

  const res = await fetch('/api/fastlane/state', {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as { state?: FastLaneState; stateVersion?: string | null; error?: string };
  const nextStateVersion = res.headers.get('x-fastlane-state-version') ?? data.stateVersion ?? null;

  if (res.status === 409 && data.state) {
    return {
      state: data.state,
      stateVersion: nextStateVersion,
      conflict: true,
    };
  }
  if (!res.ok || !data.state) throw new Error(data.error ?? 'Failed to update FastLane profile');
  return { state: data.state, stateVersion: nextStateVersion, conflict: false };
}

async function startFastRequest(): Promise<FastLaneState> {
  const headers: HeadersInit = {};
  const csrfToken = getFastLaneCsrfTokenFromCookie();
  if (csrfToken) {
    headers['x-fastlane-csrf-token'] = csrfToken;
  }
  const res = await fetch('/api/fastlane/session/start', { method: 'POST', headers });
  if (!res.ok) throw new Error('Failed to start fast');
  const data = (await res.json()) as { state: FastLaneState };
  return data.state;
}

async function endFastRequest(): Promise<{ state: FastLaneState; durationMinutes: number }> {
  const headers: HeadersInit = {};
  const csrfToken = getFastLaneCsrfTokenFromCookie();
  if (csrfToken) {
    headers['x-fastlane-csrf-token'] = csrfToken;
  }
  const res = await fetch('/api/fastlane/session/end', { method: 'POST', headers });
  if (!res.ok) throw new Error('Failed to end fast');
  return (await res.json()) as { state: FastLaneState; durationMinutes: number };
}

async function saveCheckinRequest(input: Pick<DailyCheckIn, 'energy' | 'hunger' | 'mood'>): Promise<FastLaneState> {
  const csrfToken = getFastLaneCsrfTokenFromCookie();
  const res = await fetch('/api/fastlane/checkin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'x-fastlane-csrf-token': csrfToken } : {}),
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to save check-in');
  const data = (await res.json()) as { state: FastLaneState };
  return data.state;
}

type FastLaneAccountSession = {
  authenticated: boolean;
  userId?: string;
  email?: string | null;
};

type FastLaneLinkStatus = {
  linked: boolean;
  email: string | null;
};

async function fetchAccountSession(): Promise<FastLaneAccountSession> {
  const res = await fetch('/api/fastlane/auth/session', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load account session');
  return (await res.json()) as FastLaneAccountSession;
}

async function fetchLinkStatus(): Promise<FastLaneLinkStatus> {
  const res = await fetch('/api/fastlane/auth/link', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load account link status');
  return (await res.json()) as FastLaneLinkStatus;
}

async function linkAccountEmail(email: string): Promise<FastLaneLinkStatus> {
  const csrfToken = getFastLaneCsrfTokenFromCookie();
  const res = await fetch('/api/fastlane/auth/link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'x-fastlane-csrf-token': csrfToken } : {}),
    },
    body: JSON.stringify({ email }),
  });
  const data = (await res.json()) as { error?: string; linked?: boolean; email?: string | null };
  if (!res.ok) throw new Error(data.error ?? 'Failed to link account');
  return { linked: Boolean(data.linked), email: data.email ?? null };
}

async function requestAccountSessionToken(
  email: string,
): Promise<{ ok: boolean; devLoginToken?: string; expiresInSeconds?: number }> {
  const res = await fetch('/api/fastlane/auth/session/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = (await res.json()) as { ok?: boolean; devLoginToken?: string; expiresInSeconds?: number; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? 'Failed to request sign-in token');
  return { ok: true, devLoginToken: data.devLoginToken, expiresInSeconds: data.expiresInSeconds };
}

async function verifyAccountSessionToken(token: string): Promise<FastLaneAccountSession> {
  const res = await fetch('/api/fastlane/auth/session/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = (await res.json()) as FastLaneAccountSession & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to verify sign-in token');
  return data;
}

async function clearAccountSession(): Promise<void> {
  const res = await fetch('/api/fastlane/auth/session', { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to clear account session');
}

async function fetchNotificationPlan(): Promise<FastLaneNotificationPlan> {
  const res = await fetch('/api/fastlane/notifications/plan', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load notification plan');
  return (await res.json()) as FastLaneNotificationPlan;
}

function getLoginTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('login_token');
  if (!token) return null;
  const normalized = token.trim();
  return normalized.length > 0 ? normalized : null;
}

function clearLoginTokenFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('login_token')) return;
  url.searchParams.delete('login_token');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, '', next);
}

export function FastLaneApp() {
  const monthlyPlan = getFastLanePlanConfig('monthly');
  const yearlyPlan = getFastLanePlanConfig('yearly');

  const [state, setState] = useState<FastLaneState | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [now, setNow] = useState<Date>(new Date());
  const [energy, setEnergy] = useState(3);
  const [hunger, setHunger] = useState(3);
  const [mood, setMood] = useState(3);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stateVersion, setStateVersion] = useState<string | null>(null);
  const [accountSession, setAccountSession] = useState<FastLaneAccountSession>({ authenticated: false });
  const [linkedAccountEmail, setLinkedAccountEmail] = useState<string | null>(null);
  const [accountEmailInput, setAccountEmailInput] = useState('');
  const [accountTokenInput, setAccountTokenInput] = useState('');
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [notificationPlan, setNotificationPlan] = useState<FastLaneNotificationPlan | null>(null);

  useEffect(() => {
    let canceled = false;
    const run = async () => {
      try {
        setLoading(true);
        if (isDemoModeEnabled()) {
          if (!canceled) {
            setState(DEMO_STATE);
          }
          return;
        }
        const data = await fetchFastLaneStateEnvelope();
        if (canceled) return;
        setState(data.state);
        setStateVersion(data.stateVersion);
        const [session, linkStatus] = await Promise.all([fetchAccountSession(), fetchLinkStatus()]);
        if (canceled) return;
        setAccountSession(session);
        setLinkedAccountEmail(linkStatus.email ?? null);
        if (linkStatus.email) {
          setAccountEmailInput(linkStatus.email);
        }

        const loginToken = getLoginTokenFromUrl();
        if (loginToken) {
          try {
            const verifiedSession = await verifyAccountSessionToken(loginToken);
            if (!canceled) {
              setAccountSession(verifiedSession);
              setAccountMessage('Signed in from magic link.');
            }
          } catch {
            if (!canceled) {
              setError('Magic link is invalid or expired. Request a new sign-in token.');
            }
          } finally {
            clearLoginTokenFromUrl();
          }
        }
        trackWeeklyActive();
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : 'Failed to load FastLane');
      } finally {
        if (!canceled) setLoading(false);
      }
    };
    void run();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    if (!state?.onboarded || isDemoModeEnabled()) {
      setNotificationPlan(null);
      return;
    }

    const run = async () => {
      try {
        const next = await fetchNotificationPlan();
        if (!canceled) {
          setNotificationPlan(next);
        }
      } catch {
        if (!canceled) {
          setNotificationPlan(null);
        }
      }
    };

    void run();

    return () => {
      canceled = true;
    };
  }, [
    state?.onboarded,
    state?.profile.reminders,
    state?.profile.wakeTime,
    state?.profile.sleepTime,
    state?.profile.protocolId,
    state?.activeFastStartAt,
    state?.sessions.length,
  ]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const protocol = useMemo(() => {
    const id = state?.profile.protocolId ?? '16_8';
    return FASTING_PROTOCOLS.find((p) => p.id === id) ?? FASTING_PROTOCOLS[2];
  }, [state?.profile.protocolId]);

  const elapsed = state?.activeFastStartAt ? getElapsedMinutes(state.activeFastStartAt, now) : 0;
  const progress = getProgressPercent(elapsed, protocol.fastHours);
  const streak = calculateCurrentStreak(state?.sessions ?? []);

  const averageDuration = useMemo(() => {
    if (!state || state.sessions.length === 0) return 0;
    const total = state.sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
    return Math.floor(total / state.sessions.length);
  }, [state]);

  if (loading || !state) {
    return (
      <div className={styles.shell}>
        <div className={styles.wrap}>Loading FastLane...</div>
      </div>
    );
  }

  const completeOnboarding = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (isDemoModeEnabled()) {
        const next = { ...state, onboarded: true };
        setState(next);
        setShowPaywall(true);
        return;
      }
      const result = await updateFastLaneState({ onboarded: true }, stateVersion);
      setState(result.state);
      setStateVersion(result.stateVersion);
      if (result.conflict) {
        setError('Your profile changed on another device. Synced latest state; try again.');
        return;
      }
      trackEvent('onboarding_completed', { protocol: result.state.profile.protocolId, goal: result.state.profile.goal });
      trackEvent('paywall_viewed', { context: 'post_onboarding' });
      setShowPaywall(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding');
    } finally {
      setSubmitting(false);
    }
  };

  const patchProfile = async (payload: Record<string, unknown>) => {
    setSubmitting(true);
    setError(null);
    try {
      if (isDemoModeEnabled()) {
        const next: FastLaneState = {
          ...state,
          profile: {
            ...state.profile,
            ...(payload.goal !== undefined ? { goal: payload.goal as FastingGoal } : {}),
            ...(payload.experience !== undefined ? { experience: payload.experience as ExperienceLevel } : {}),
            ...(payload.protocolId !== undefined ? { protocolId: payload.protocolId as string } : {}),
            ...(payload.wakeTime !== undefined ? { wakeTime: payload.wakeTime as string } : {}),
            ...(payload.sleepTime !== undefined ? { sleepTime: payload.sleepTime as string } : {}),
            ...(payload.reminders !== undefined ? { reminders: Boolean(payload.reminders) } : {}),
          },
          ...(payload.onboarded !== undefined ? { onboarded: Boolean(payload.onboarded) } : {}),
        };
        setState(next);
        return;
      }
      const result = await updateFastLaneState(payload, stateVersion);
      setState(result.state);
      setStateVersion(result.stateVersion);
      if (result.conflict) {
        setError('Your profile changed on another device. Latest state loaded.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSubmitting(false);
    }
  };

  const startFast = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (isDemoModeEnabled()) {
        const next = { ...state, activeFastStartAt: DEMO_BASE_TIME };
        setState(next);
        return;
      }
      const next = await startFastRequest();
      setState(next);
      trackEvent('first_fast_started', { protocol: next.profile.protocolId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start fast');
    } finally {
      setSubmitting(false);
    }
  };

  const stopFast = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (isDemoModeEnabled()) {
        const startAt = state.activeFastStartAt ?? DEMO_BASE_TIME;
        const endAt = new Date(new Date(startAt).getTime() + 16 * 60 * 60 * 1000).toISOString();
        const next: FastLaneState = {
          ...state,
          activeFastStartAt: null,
          sessions: [
            {
              id: `demo-${Date.now()}`,
              startAt,
              endAt,
              durationMinutes: 960,
              protocolId: state.profile.protocolId,
            },
            ...state.sessions,
          ],
        };
        setState(next);
        return;
      }
      const result = await endFastRequest();
      setState(result.state);
      trackEvent('first_fast_completed', { durationMinutes: result.durationMinutes });
      if (result.state.tier === 'free' && result.state.sessions.length >= 3) {
        trackEvent('paywall_viewed', { context: 'milestone_3_sessions' });
        setShowPaywall(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end fast');
    } finally {
      setSubmitting(false);
    }
  };

  const saveCheckIn = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (isDemoModeEnabled()) {
        const next: FastLaneState = {
          ...state,
          checkIns: [
            {
              date: new Date().toISOString(),
              energy,
              hunger,
              mood,
            },
            ...state.checkIns,
          ],
        };
        setState(next);
        return;
      }
      const next = await saveCheckinRequest({ energy, hunger, mood });
      setState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save check-in');
    } finally {
      setSubmitting(false);
    }
  };

  const openPaywall = (context: string) => {
    trackEvent('paywall_viewed', { context });
    setShowPaywall(true);
  };

  const startCheckout = async (plan: 'monthly' | 'yearly') => {
    setSubmitting(true);
    setError(null);
    try {
      if (isDemoModeEnabled()) {
        trackEvent('trial_started', { plan, demo: true });
        setShowPaywall(false);
        return;
      }
      trackEvent('trial_started', { plan });
      const res = await fetch('/api/fastlane/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });

      const data = (await res.json()) as { checkoutUrl?: string; error?: string };
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.error ?? 'Unable to start checkout');
      }

      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
      setSubmitting(false);
    }
  };

  const openBillingPortal = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (isDemoModeEnabled()) {
        return;
      }
      const res = await fetch('/api/fastlane/billing/portal', { method: 'POST' });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? 'Unable to open billing portal');
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open billing portal');
      setSubmitting(false);
    }
  };

  const logoutAndReset = async () => {
    setSubmitting(true);
    setError(null);
    setShowPaywall(false);
    try {
      if (isDemoModeEnabled()) {
        setState(DEMO_STATE);
        setOnboardingStep(1);
        return;
      }
      await resetGuestSession();
      const next = await fetchFastLaneStateEnvelope();
      setState(next.state);
      setStateVersion(next.stateVersion);
      setAccountSession({ authenticated: false });
      setLinkedAccountEmail(null);
      setAccountEmailInput('');
      setAccountTokenInput('');
      setAccountMessage(null);
      setOnboardingStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset session');
    } finally {
      setSubmitting(false);
    }
  };

  const linkAccount = async () => {
    setSubmitting(true);
    setError(null);
    setAccountMessage(null);
    try {
      const linked = await linkAccountEmail(accountEmailInput);
      setLinkedAccountEmail(linked.email);
      if (linked.email) {
        setAccountEmailInput(linked.email);
      }
      setAccountMessage('Account email linked. Request a sign-in token to continue.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link account');
    } finally {
      setSubmitting(false);
    }
  };

  const requestSignInToken = async () => {
    setSubmitting(true);
    setError(null);
    setAccountMessage(null);
    try {
      const result = await requestAccountSessionToken(accountEmailInput);
      if (result.devLoginToken) {
        setAccountTokenInput(result.devLoginToken);
        setAccountMessage(
          `Dev token generated (${result.expiresInSeconds ?? 600}s). Verify to open account session.`,
        );
      } else {
        setAccountMessage('If this account exists, a sign-in link was sent.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request sign-in token');
    } finally {
      setSubmitting(false);
    }
  };

  const verifySignInToken = async () => {
    setSubmitting(true);
    setError(null);
    setAccountMessage(null);
    try {
      const session = await verifyAccountSessionToken(accountTokenInput);
      setAccountSession(session);
      setAccountMessage('Account session active on this device.');
      clearLoginTokenFromUrl();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify sign-in token');
    } finally {
      setSubmitting(false);
    }
  };

  const signOutAccount = async () => {
    setSubmitting(true);
    setError(null);
    setAccountMessage(null);
    try {
      await clearAccountSession();
      setAccountSession({ authenticated: false });
      setAccountMessage('Signed out from account session.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign out account');
    } finally {
      setSubmitting(false);
    }
  };

  if (!state.onboarded) {
    return (
      <div className={styles.shell}>
        <div className={styles.wrap}>
          <div className={styles.top}>
            <div className={styles.brand}>FastLane Setup</div>
            <div className={styles.tier}>Free</div>
          </div>

          <section className={`${styles.card} ${styles.onboarding}`}>
            <div className={styles.step}>Step {onboardingStep} of 3</div>
            <h1>Build your fasting plan</h1>

            {onboardingStep === 1 && (
              <>
                <label>
                  Goal
                  <select className={styles.select} value={state.profile.goal} onChange={(e) => void patchProfile({ goal: e.target.value as FastingGoal })}>
                    <option value="weight">Weight management</option>
                    <option value="energy">Energy and focus</option>
                    <option value="metabolic">Metabolic health</option>
                    <option value="routine">Routine consistency</option>
                  </select>
                </label>
                <label>
                  Experience
                  <select className={styles.select} value={state.profile.experience} onChange={(e) => void patchProfile({ experience: e.target.value as ExperienceLevel })}>
                    <option value="new">New to fasting</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </label>
                <button className={`${styles.btn} ${styles.primary}`} onClick={() => setOnboardingStep(2)} disabled={submitting}>
                  Continue
                </button>
              </>
            )}

            {onboardingStep === 2 && (
              <>
                <label>
                  Preferred protocol
                  <select className={styles.select} value={state.profile.protocolId} onChange={(e) => void patchProfile({ protocolId: e.target.value })}>
                    {FASTING_PROTOCOLS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} {p.premium ? '(Pro)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Wake time
                  <input className={styles.input} type="time" value={state.profile.wakeTime} onChange={(e) => void patchProfile({ wakeTime: e.target.value })} />
                </label>
                <label>
                  Sleep time
                  <input className={styles.input} type="time" value={state.profile.sleepTime} onChange={(e) => void patchProfile({ sleepTime: e.target.value })} />
                </label>
                <div className={styles.row}>
                  <button className={`${styles.btn} ${styles.ghost}`} onClick={() => setOnboardingStep(1)} disabled={submitting}>Back</button>
                  <button className={`${styles.btn} ${styles.primary}`} onClick={() => setOnboardingStep(3)} disabled={submitting}>Continue</button>
                </div>
              </>
            )}

            {onboardingStep === 3 && (
              <>
                <label>
                  Reminder preference
                  <select className={styles.select} value={state.profile.reminders ? 'on' : 'off'} onChange={(e) => void patchProfile({ reminders: e.target.value === 'on' })}>
                    <option value="on">On - start/end window reminders</option>
                    <option value="off">Off</option>
                  </select>
                </label>
                <p className={styles.small}>
                  You can change any setting later. The goal is to get your first fast started immediately.
                </p>
                <div className={styles.row}>
                  <button className={`${styles.btn} ${styles.ghost}`} onClick={() => setOnboardingStep(2)} disabled={submitting}>Back</button>
                  <button
                    className={`${styles.btn} ${styles.primary}`}
                    onClick={() => {
                      trackEvent('signup_started');
                      void completeOnboarding();
                    }}
                    disabled={submitting}
                  >
                    Enter FastLane
                  </button>
                </div>
              </>
            )}

            {error && <p className={styles.locked}>{error}</p>}
          </section>
        </div>

        {showPaywall && (
          <div className={styles.overlay}>
            <div className={styles.modal}>
              <h2>Unlock FastLane Pro</h2>
              <p>Get advanced insights, premium protocols, and unlimited history.</p>
              <div className={styles.row}>
                <button className={`${styles.btn} ${styles.primary}`} onClick={() => void startCheckout('monthly')} disabled={submitting}>
                  Start Pro {monthlyPlan.label} - {formatUsd(monthlyPlan.billedUsd)}
                </button>
                <button className={`${styles.btn} ${styles.primary}`} onClick={() => void startCheckout('yearly')} disabled={submitting}>
                  Start Pro {yearlyPlan.label} - {formatUsd(yearlyPlan.billedUsd)}
                </button>
                <button className={`${styles.btn} ${styles.ghost}`} onClick={() => setShowPaywall(false)} disabled={submitting}>Continue with Free</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.wrap}>
        <div className={styles.top}>
          <div className={styles.brand}>FastLane Dashboard</div>
          <div className={styles.topActions}>
            <button className={styles.tier} onClick={() => openPaywall('header_badge')}>
              {state.tier === 'pro' ? 'PRO' : 'FREE'}
            </button>
            <button
              className={styles.tier}
              onClick={() => void logoutAndReset()}
              disabled={submitting}
              aria-label="Reset session"
            >
              Reset Session
            </button>
          </div>
        </div>

        <section className={`${styles.card} ${styles.hero}`}>
          <div className={styles.label}>{state.activeFastStartAt ? 'Fasting now' : 'Ready to fast'}</div>
          <h1 className={styles.timer}>{formatDurationMinutes(elapsed)}</h1>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          <div className={styles.meta}>
            <span>{protocol.label}</span>
            <span>{Math.round(progress)}% complete</span>
          </div>
          <div className={styles.row}>
            {!state.activeFastStartAt ? (
              <button className={`${styles.btn} ${styles.primary}`} onClick={() => void startFast()} disabled={submitting}>Start Fast</button>
            ) : (
              <button className={`${styles.btn} ${styles.primary}`} onClick={() => void stopFast()} disabled={submitting}>End Fast</button>
            )}
            <select
              className={styles.select}
              aria-label="Fasting protocol"
              value={state.profile.protocolId}
              onChange={(e) => {
                const selected = FASTING_PROTOCOLS.find((p) => p.id === e.target.value);
                if (selected?.premium && state.tier === 'free') {
                  openPaywall('premium_protocol_locked');
                  return;
                }
                void patchProfile({ protocolId: e.target.value });
              }}
              disabled={submitting}
            >
              {FASTING_PROTOCOLS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} {p.premium ? '(Pro)' : ''}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className={styles.grid}>
          <article className={styles.card}>
            <h2>Consistency</h2>
            <div className={styles.kpis}>
              <div className={styles.kpi}>
                <strong>{streak}</strong>
                <span>Day streak</span>
              </div>
              <div className={styles.kpi}>
                <strong>{state.sessions.length}</strong>
                <span>Total fasts</span>
              </div>
              <div className={styles.kpi}>
                <strong>{formatDurationMinutes(averageDuration)}</strong>
                <span>Avg duration</span>
              </div>
            </div>

            <h3>History</h3>
            <div className={styles.history}>
              {state.sessions.length === 0 && <div className={styles.small}>No completed sessions yet.</div>}
              {state.sessions.slice(0, state.tier === 'pro' ? 8 : 4).map((s) => (
                <div key={s.id} className={styles.historyRow}>
                  <span>{new Date(s.endAt).toLocaleDateString()}</span>
                  <span>{formatDurationMinutes(s.durationMinutes)}</span>
                </div>
              ))}
            </div>
            {state.tier === 'free' && state.sessions.length > 4 && (
              <div className={styles.locked}>Upgrade to Pro to unlock full history.</div>
            )}
          </article>

          <article className={styles.card}>
            <h2>Daily Check-In</h2>
            <label>
              Energy ({energy}/5)
              <input className={styles.input} type="range" min={1} max={5} value={energy} onChange={(e) => setEnergy(Number(e.target.value))} />
            </label>
            <label>
              Hunger ({hunger}/5)
              <input className={styles.input} type="range" min={1} max={5} value={hunger} onChange={(e) => setHunger(Number(e.target.value))} />
            </label>
            <label>
              Mood ({mood}/5)
              <input className={styles.input} type="range" min={1} max={5} value={mood} onChange={(e) => setMood(Number(e.target.value))} />
            </label>
            <div className={styles.row}>
              <button className={`${styles.btn} ${styles.primary}`} onClick={() => void saveCheckIn()} disabled={submitting}>Save check-in</button>
            </div>

            <h3>Insights</h3>
            {state.tier === 'pro' ? (
              <>
                <p className={styles.small}>
                  Trendline: On days with check-in energy at least 4, your average fasting duration is trending upward.
                </p>
                <button className={`${styles.btn} ${styles.ghost}`} onClick={() => void openBillingPortal()} disabled={submitting}>
                  Manage billing
                </button>
              </>
            ) : (
              <>
                <p className={styles.locked}>Advanced insights are Pro-only.</p>
                <button className={`${styles.btn} ${styles.ghost}`} onClick={() => openPaywall('insights_locked')}>
                  Unlock Pro Insights
                </button>
              </>
            )}
          </article>

          <article className={styles.card}>
            <h2>Account</h2>
            <p className={styles.small}>
              Link an email and use token sign-in to persist this profile across devices.
            </p>
            <label>
              Account email
              <input
                className={styles.input}
                type="email"
                value={accountEmailInput}
                onChange={(e) => setAccountEmailInput(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <div className={styles.row}>
              <button
                className={`${styles.btn} ${styles.primary}`}
                onClick={() => void linkAccount()}
                disabled={submitting || accountEmailInput.trim().length === 0}
              >
                Link account email
              </button>
              <button
                className={`${styles.btn} ${styles.ghost}`}
                onClick={() => void requestSignInToken()}
                disabled={submitting || accountEmailInput.trim().length === 0}
              >
                Request sign-in token
              </button>
            </div>
            <label>
              Sign-in token
              <input
                className={styles.input}
                value={accountTokenInput}
                onChange={(e) => setAccountTokenInput(e.target.value)}
                placeholder="paste token"
              />
            </label>
            <div className={styles.row}>
              <button
                className={`${styles.btn} ${styles.primary}`}
                onClick={() => void verifySignInToken()}
                disabled={submitting || accountTokenInput.trim().length === 0}
              >
                Verify token
              </button>
              <button
                className={`${styles.btn} ${styles.ghost}`}
                onClick={() => void signOutAccount()}
                disabled={submitting || !accountSession.authenticated}
              >
                Sign out account
              </button>
            </div>
            <p className={styles.small}>
              Linked email: {linkedAccountEmail ?? 'Not linked'} | Session:{' '}
              {accountSession.authenticated ? 'Active' : 'Guest only'}
            </p>
            {accountMessage && <p className={styles.small}>{accountMessage}</p>}
          </article>

          <article className={styles.card}>
            <h2>Notification Plan</h2>
            <p className={styles.small}>Lifecycle reminders generated from your current routine and fasting state.</p>
            <p className={styles.small}>
              Reminders: {state.profile.reminders ? 'Enabled' : 'Paused'}
            </p>
            <div className={styles.row}>
              <button
                className={`${styles.btn} ${styles.ghost}`}
                onClick={() => void patchProfile({ reminders: !state.profile.reminders })}
                disabled={submitting}
              >
                {state.profile.reminders ? 'Pause reminders' : 'Enable reminders'}
              </button>
            </div>
            {!notificationPlan?.enabled && (
              <p className={styles.small}>No reminders scheduled while reminders are paused.</p>
            )}
            {notificationPlan?.enabled && notificationPlan.next.length === 0 && (
              <p className={styles.small}>No reminders currently scheduled.</p>
            )}
            {notificationPlan?.next?.map((item) => (
              <div key={item.id} className={styles.historyRow}>
                <span>
                  {item.title}
                  {' '}({item.channel === 'email' ? 'Email' : 'In-app'})
                </span>
                <span>{new Date(item.sendAt).toLocaleString()}</span>
              </div>
            ))}
          </article>
        </section>

        {error && <p className={styles.locked}>{error}</p>}
        <p className={styles.small}>
          FastLane provides educational support and is not medical advice. Consult your clinician before major dietary changes.
        </p>
        <div className={styles.legalRow}>
          <Link href="/fastlane/privacy" className={styles.legalLink}>Privacy</Link>
          <Link href="/fastlane/terms" className={styles.legalLink}>Terms</Link>
          <Link href="/fastlane/disclaimer" className={styles.legalLink}>Disclaimer</Link>
        </div>
      </div>

      {showPaywall && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2>Go Pro</h2>
            <p>Upgrade for premium protocols, unlimited history, and advanced insight cards.</p>
            <div className={styles.row}>
              <button className={`${styles.btn} ${styles.primary}`} onClick={() => void startCheckout('monthly')} disabled={submitting}>
                Start {monthlyPlan.label} - {formatUsd(monthlyPlan.billedUsd)}
              </button>
              <button className={`${styles.btn} ${styles.primary}`} onClick={() => void startCheckout('yearly')} disabled={submitting}>
                Start {yearlyPlan.label} - {formatUsd(yearlyPlan.billedUsd)}
              </button>
              <button className={`${styles.btn} ${styles.ghost}`} onClick={() => setShowPaywall(false)} disabled={submitting}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
