import * as Sentry from '@sentry/nextjs';
import { isValidSentryDsn } from './src/lib/utils/sentry';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (isValidSentryDsn(SENTRY_DSN)) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    environment: process.env.NODE_ENV,
  });
}
