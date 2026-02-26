import { getMonitoringReadiness, type MonitoringReadiness } from './monitoring';

export interface ServiceReadiness {
  databaseConfigured: boolean;
  authConfigured: boolean;
  authEmailConfigured: boolean;
  billingConfigured: boolean;
  monitoring: MonitoringReadiness;
  readyForProduction: boolean;
}

function hasNonPlaceholder(value: string | undefined | null): boolean {
  if (!value) return false;
  const normalized = value.trim();
  if (normalized.length === 0) return false;
  if (normalized.includes('...')) return false;
  return true;
}

export function getServiceReadiness(env: NodeJS.ProcessEnv = process.env): ServiceReadiness {
  const databaseConfigured = hasNonPlaceholder(env.DATABASE_URL);
  const authConfigured =
    hasNonPlaceholder(env.CRON_SECRET) || hasNonPlaceholder(env.USER_COOKIE_SECRET);
  const authEmailConfigured =
    hasNonPlaceholder(env.RESEND_API_KEY) && hasNonPlaceholder(env.FASTLANE_AUTH_EMAIL_FROM);
  const billingConfigured =
    hasNonPlaceholder(env.STRIPE_SECRET_KEY) &&
    hasNonPlaceholder(env.STRIPE_WEBHOOK_SECRET) &&
    hasNonPlaceholder(env.STRIPE_PRICE_MONTHLY) &&
    hasNonPlaceholder(env.STRIPE_PRICE_YEARLY);

  const monitoring = getMonitoringReadiness(env);

  return {
    databaseConfigured,
    authConfigured,
    authEmailConfigured,
    billingConfigured,
    monitoring,
    readyForProduction:
      databaseConfigured &&
      authConfigured &&
      authEmailConfigured &&
      billingConfigured &&
      monitoring.readyForProduction,
  };
}
