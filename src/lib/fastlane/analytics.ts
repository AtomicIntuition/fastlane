const EVENT_KEY = 'fastlane.events.v1';

type EventName =
  | 'landing_cta_clicked'
  | 'signup_started'
  | 'onboarding_completed'
  | 'first_fast_started'
  | 'first_fast_completed'
  | 'paywall_viewed'
  | 'trial_started'
  | 'subscription_started'
  | 'subscription_canceled'
  | 'weekly_active_user';

interface EventPayload {
  name: EventName;
  at: string;
  props?: Record<string, string | number | boolean | null>;
}

function sendEventToServer(payload: EventPayload): void {
  if (typeof window === 'undefined') return;

  void fetch('/api/fastlane/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Keep analytics fire-and-forget.
  });
}

export function trackEvent(name: EventName, props?: EventPayload['props']): void {
  if (typeof window === 'undefined') return;

  const payload: EventPayload = {
    name,
    at: new Date().toISOString(),
    props,
  };

  try {
    const current: EventPayload[] = JSON.parse(localStorage.getItem(EVENT_KEY) ?? '[]');
    localStorage.setItem(EVENT_KEY, JSON.stringify([payload, ...current].slice(0, 500)));
  } catch {
    // Keep analytics non-blocking for UX.
  }

  sendEventToServer(payload);

  // Helps validate instrumentation in local/dev.
  console.info('[FastLane analytics]', payload);
}

function getIsoWeekId(date = new Date()): string {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${week}`;
}

export function trackWeeklyActive(): void {
  if (typeof window === 'undefined') return;
  const key = 'fastlane.lastWeeklyActive';
  const currentWeek = getIsoWeekId();
  const lastWeek = localStorage.getItem(key);

  if (lastWeek !== currentWeek) {
    trackEvent('weekly_active_user');
    localStorage.setItem(key, currentWeek);
  }
}
