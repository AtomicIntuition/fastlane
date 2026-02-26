import { isValidSentryDsn } from './sentry';

export interface MonitoringReadiness {
  sentryServerDsnConfigured: boolean;
  sentryClientDsnConfigured: boolean;
  alertsRoutingConfigured: boolean;
  readyForProduction: boolean;
}

function hasNonPlaceholder(value: string | undefined | null): boolean {
  if (!value) return false;
  const normalized = value.trim();
  if (normalized.length === 0) return false;
  if (normalized.includes('...')) return false;
  return true;
}

export function getMonitoringReadiness(env: NodeJS.ProcessEnv = process.env): MonitoringReadiness {
  const sentryServerDsnConfigured = isValidSentryDsn(env.SENTRY_DSN);
  const sentryClientDsnConfigured = isValidSentryDsn(env.NEXT_PUBLIC_SENTRY_DSN);

  const alertsRoutingConfigured =
    hasNonPlaceholder(env.SENTRY_ALERT_WEBHOOK_URL) || hasNonPlaceholder(env.ALERT_EMAIL_TO);

  return {
    sentryServerDsnConfigured,
    sentryClientDsnConfigured,
    alertsRoutingConfigured,
    readyForProduction:
      sentryServerDsnConfigured && sentryClientDsnConfigured && alertsRoutingConfigured,
  };
}
