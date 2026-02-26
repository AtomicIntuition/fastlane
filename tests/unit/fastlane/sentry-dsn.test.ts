import { describe, expect, it } from 'vitest';

import { isValidSentryDsn } from '@/lib/utils/sentry';

describe('isValidSentryDsn', () => {
  it('accepts valid sentry dsn values', () => {
    expect(isValidSentryDsn('https://abc123@o123.ingest.sentry.io/456')).toBe(true);
  });

  it('rejects placeholder and malformed values', () => {
    expect(isValidSentryDsn('https://...@sentry.io/...')).toBe(false);
    expect(isValidSentryDsn('not-a-url')).toBe(false);
    expect(isValidSentryDsn(undefined)).toBe(false);
  });
});
