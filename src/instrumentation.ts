import { isValidSentryDsn } from '@/lib/utils/sentry';
import { getMonitoringReadiness } from '@/lib/utils/monitoring';

export async function register() {
  if (process.env.NODE_ENV === 'production') {
    const monitoring = getMonitoringReadiness();
    if (!monitoring.readyForProduction) {
      console.error('[FastLane monitoring] Monitoring not production-ready', {
        sentryServerDsnConfigured: monitoring.sentryServerDsnConfigured,
        sentryClientDsnConfigured: monitoring.sentryClientDsnConfigured,
        alertsRoutingConfigured: monitoring.alertsRoutingConfigured,
      });
    }
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = async (...args: unknown[]) => {
  const SENTRY_DSN = process.env.SENTRY_DSN;
  if (!isValidSentryDsn(SENTRY_DSN)) return;

  const { captureRequestError } = await import('@sentry/nextjs');
  // @ts-expect-error - Sentry's captureRequestError typing
  return captureRequestError(...args);
};
