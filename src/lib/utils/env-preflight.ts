export interface EnvPreflightOptions {
  strict?: boolean;
}

export interface EnvPreflightResult {
  ok: boolean;
  strict: boolean;
  errors: string[];
  warnings: string[];
}

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function hasAnyAlertRouting(env: NodeJS.ProcessEnv): boolean {
  return isNonEmpty(env.SENTRY_ALERT_WEBHOOK_URL) || isNonEmpty(env.ALERT_EMAIL_TO);
}

function checkRequired(
  env: NodeJS.ProcessEnv,
  result: EnvPreflightResult,
  key: string,
): string | undefined {
  const value = env[key];
  if (!isNonEmpty(value)) {
    if (result.strict) {
      result.errors.push(`Missing required env var: ${key}`);
    } else {
      result.warnings.push(`Missing recommended env var: ${key}`);
    }
    return undefined;
  }
  return value.trim();
}

function checkSecret(
  env: NodeJS.ProcessEnv,
  result: EnvPreflightResult,
  key: string,
  minLength: number,
) {
  const value = checkRequired(env, result, key);
  if (!value) return;
  if (value.length < minLength) {
    result.errors.push(`${key} must be at least ${minLength} characters.`);
  }
}

export function runEnvPreflight(
  env: NodeJS.ProcessEnv = process.env,
  options: EnvPreflightOptions = {},
): EnvPreflightResult {
  const strict = options.strict === true;
  const result: EnvPreflightResult = {
    ok: true,
    strict,
    errors: [],
    warnings: [],
  };

  const databaseUrl = checkRequired(env, result, 'DATABASE_URL');
  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    result.errors.push('DATABASE_URL must start with postgres:// or postgresql://');
  }

  const appUrl = checkRequired(env, result, 'NEXT_PUBLIC_APP_URL');
  if (appUrl) {
    if (!isValidUrl(appUrl)) {
      result.errors.push('NEXT_PUBLIC_APP_URL must be a valid URL.');
    } else if (strict && !appUrl.startsWith('https://')) {
      result.errors.push('NEXT_PUBLIC_APP_URL must use https:// in strict mode.');
    }
  }

  const stripeSecret = checkRequired(env, result, 'STRIPE_SECRET_KEY');
  if (stripeSecret && !stripeSecret.startsWith('sk_')) {
    result.errors.push('STRIPE_SECRET_KEY must start with sk_.');
  }

  const stripeWebhook = checkRequired(env, result, 'STRIPE_WEBHOOK_SECRET');
  if (stripeWebhook && !stripeWebhook.startsWith('whsec_')) {
    result.errors.push('STRIPE_WEBHOOK_SECRET must start with whsec_.');
  }

  const stripeMonthly = checkRequired(env, result, 'STRIPE_PRICE_MONTHLY');
  if (stripeMonthly && !stripeMonthly.startsWith('price_')) {
    result.errors.push('STRIPE_PRICE_MONTHLY must start with price_.');
  }

  const stripeYearly = checkRequired(env, result, 'STRIPE_PRICE_YEARLY');
  if (stripeYearly && !stripeYearly.startsWith('price_')) {
    result.errors.push('STRIPE_PRICE_YEARLY must start with price_.');
  }

  const resendApiKey = checkRequired(env, result, 'RESEND_API_KEY');
  if (resendApiKey && !resendApiKey.startsWith('re_')) {
    result.errors.push('RESEND_API_KEY must start with re_.');
  }

  const authEmailFrom = checkRequired(env, result, 'FASTLANE_AUTH_EMAIL_FROM');
  if (authEmailFrom && !/.+<[^>]+@[^>]+>/.test(authEmailFrom)) {
    result.errors.push('FASTLANE_AUTH_EMAIL_FROM should use "Name <email@domain>" format.');
  }

  const sentryDsn = checkRequired(env, result, 'SENTRY_DSN');
  if (sentryDsn && !isValidUrl(sentryDsn)) {
    result.errors.push('SENTRY_DSN must be a valid URL.');
  }

  const publicSentryDsn = checkRequired(env, result, 'NEXT_PUBLIC_SENTRY_DSN');
  if (publicSentryDsn && !isValidUrl(publicSentryDsn)) {
    result.errors.push('NEXT_PUBLIC_SENTRY_DSN must be a valid URL.');
  }

  if (!hasAnyAlertRouting(env)) {
    if (strict) {
      result.errors.push('Set SENTRY_ALERT_WEBHOOK_URL or ALERT_EMAIL_TO for alert routing.');
    } else {
      result.warnings.push('Set SENTRY_ALERT_WEBHOOK_URL or ALERT_EMAIL_TO for alert routing.');
    }
  }

  checkSecret(env, result, 'CRON_SECRET', 32);
  checkSecret(env, result, 'USER_COOKIE_SECRET', 32);
  checkSecret(env, result, 'FASTLANE_ACCOUNT_SESSION_SECRET', 32);
  checkSecret(env, result, 'FASTLANE_LOGIN_TOKEN_SECRET', 32);

  result.ok = result.errors.length === 0;
  return result;
}
