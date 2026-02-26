// ============================================================
// Signed Cookie Utility for User Identity
// ============================================================
// Generates and verifies HMAC-signed userId cookies to prevent
// impersonation. The userId is a UUID + HMAC signature.
//
// Cookie format: {userId}.{hmac}
// ============================================================

import { createHmac, randomUUID } from 'crypto';

const COOKIE_NAME = 'userId';
const SEPARATOR = '.';
const MAX_SIGNED_COOKIE_VALUE_LENGTH = 512;
const MAX_USER_ID_LENGTH = 100;
const COOKIE_HMAC_REGEX = /^[0-9a-f]{16}$/i;
const MAX_SIGNED_COOKIE_ISSUED_AT_LENGTH = 10;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const DEFAULT_SIGNED_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const MIN_SIGNED_COOKIE_MAX_AGE_SECONDS = 60;
const MAX_SIGNED_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 5;
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Get the signing secret. Falls back to CRON_SECRET if no
 * dedicated USER_COOKIE_SECRET is set.
 */
function getSecret(): string {
  const secret = process.env.USER_COOKIE_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('USER_COOKIE_SECRET or CRON_SECRET must be set');
  }
  return secret;
}

function signWithIssuedAt(userId: string, issuedAtSeconds: number): string {
  const payload = `${userId}${SEPARATOR}${issuedAtSeconds.toString()}`;
  const hmac = createHmac('sha256', getSecret())
    .update(payload)
    .digest('hex')
    .slice(0, 16);
  return `${payload}${SEPARATOR}${hmac}`;
}

function getSignedCookieMaxAgeSeconds(): number {
  const configured = process.env.USER_COOKIE_MAX_AGE_SECONDS;
  if (!configured) return DEFAULT_SIGNED_COOKIE_MAX_AGE_SECONDS;

  const normalized = configured.trim();
  if (!/^\d+$/.test(normalized)) return DEFAULT_SIGNED_COOKIE_MAX_AGE_SECONDS;

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) return DEFAULT_SIGNED_COOKIE_MAX_AGE_SECONDS;
  if (parsed < MIN_SIGNED_COOKIE_MAX_AGE_SECONDS) return MIN_SIGNED_COOKIE_MAX_AGE_SECONDS;
  if (parsed > MAX_SIGNED_COOKIE_MAX_AGE_SECONDS) return MAX_SIGNED_COOKIE_MAX_AGE_SECONDS;
  return parsed;
}

function verifyLegacySignedCookie(cookieValue: string): string | null {
  const sepIndex = cookieValue.lastIndexOf(SEPARATOR);
  if (sepIndex === -1) return null;

  const userId = cookieValue.slice(0, sepIndex);
  const providedHmac = cookieValue.slice(sepIndex + 1);
  if (!userId || !providedHmac) return null;
  if (userId.length > MAX_USER_ID_LENGTH) return null;
  if (!UUID_V4_REGEX.test(userId)) return null;
  if (!COOKIE_HMAC_REGEX.test(providedHmac)) return null;

  const expectedHmac = createHmac('sha256', getSecret())
    .update(userId)
    .digest('hex')
    .slice(0, 16);
  if (providedHmac.length !== expectedHmac.length) return null;

  let mismatch = 0;
  for (let i = 0; i < providedHmac.length; i++) {
    mismatch |= providedHmac.charCodeAt(i) ^ expectedHmac.charCodeAt(i);
  }
  return mismatch === 0 ? userId : null;
}

/** Verify a signed cookie value. Returns the userId if valid, null otherwise. */
export function verifySignedCookie(cookieValue: string): string | null {
  try {
    if (cookieValue.length > MAX_SIGNED_COOKIE_VALUE_LENGTH) return null;
    const segments = cookieValue.split(SEPARATOR);

    if (segments.length === 2) {
      return verifyLegacySignedCookie(cookieValue);
    }

    if (segments.length !== 3) return null;
    const [userId, issuedAtRaw, providedHmac] = segments;
    if (!userId || !issuedAtRaw || !providedHmac) return null;
    if (userId.length > MAX_USER_ID_LENGTH) return null;
    if (!UUID_V4_REGEX.test(userId)) return null;
    if (issuedAtRaw.length > MAX_SIGNED_COOKIE_ISSUED_AT_LENGTH) return null;
    if (!/^\d+$/.test(issuedAtRaw)) return null;
    if (!COOKIE_HMAC_REGEX.test(providedHmac)) return null;

    const payload = `${userId}${SEPARATOR}${issuedAtRaw}`;
    const expectedHmac = createHmac('sha256', getSecret()).update(payload).digest('hex').slice(0, 16);
    if (providedHmac.length !== expectedHmac.length) return null;

    let mismatch = 0;
    for (let i = 0; i < providedHmac.length; i++) {
      mismatch |= providedHmac.charCodeAt(i) ^ expectedHmac.charCodeAt(i);
    }
    if (mismatch !== 0) return null;

    const issuedAtSeconds = Number(issuedAtRaw);
    if (!Number.isSafeInteger(issuedAtSeconds) || issuedAtSeconds < 0) return null;

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (issuedAtSeconds - nowSeconds > MAX_CLOCK_SKEW_SECONDS) return null;

    const maxAgeSeconds = getSignedCookieMaxAgeSeconds();
    if (nowSeconds - issuedAtSeconds > maxAgeSeconds) return null;
    return userId;
  } catch {
    return null;
  }
}

/** Generate a new signed userId cookie value. */
export function generateSignedUserId(): string {
  const userId = randomUUID();
  const issuedAtSeconds = Math.floor(Date.now() / 1000);
  return signWithIssuedAt(userId, issuedAtSeconds);
}

export function getUserIdFromSignedCookieValue(cookieValue: string): string | null {
  const segments = cookieValue.split(SEPARATOR);
  if (segments.length === 2 || segments.length === 3) {
    const [userId] = segments;
    if (userId.length > MAX_USER_ID_LENGTH) return null;
    return UUID_V4_REGEX.test(userId) ? userId : null;
  }
  return null;
}

/** Cookie name constant for consistent usage. */
export { COOKIE_NAME };

/**
 * Extract and verify the userId from a request.
 * Checks signed cookie first, then falls back to unsigned cookie/header
 * for backwards compatibility with existing users.
 */
export function getUserIdFromRequest(request: {
  cookies: { get: (name: string) => { value: string } | undefined };
  headers: { get: (name: string) => string | null };
}): string | null {
  try {
    // Priority 1: Signed cookie
    const signedCookie = request.cookies.get(COOKIE_NAME);
    if (signedCookie?.value) {
      const verified = verifySignedCookie(signedCookie.value);
      if (verified) return verified;
    }

    // Priority 2: Legacy unsigned cookie (backwards compat)
    // The old system stored plain UUIDs. Disable in production by default to
    // prevent spoofing; allow only via explicit migration flag.
    if (signedCookie?.value && !signedCookie.value.includes(SEPARATOR)) {
      const allowLegacyUnsignedCookie =
        process.env.NODE_ENV !== 'production' ||
        process.env.ALLOW_LEGACY_UNSIGNED_USER_COOKIE === 'true';

      if (allowLegacyUnsignedCookie && UUID_V4_REGEX.test(signedCookie.value)) {
        return signedCookie.value;
      }
    }

    // Priority 3: x-user-id header (legacy fallback).
    // Disabled in production by default to prevent user impersonation via spoofed headers.
    const allowLegacyHeader =
      process.env.NODE_ENV !== 'production' || process.env.ALLOW_LEGACY_USER_ID_HEADER === 'true';
    if (!allowLegacyHeader) {
      return null;
    }

    const headerUserId = request.headers.get('x-user-id');
    if (headerUserId) {
      const normalizedHeaderUserId = headerUserId.trim();
      if (!normalizedHeaderUserId) return null;
      if (normalizedHeaderUserId.length > MAX_USER_ID_LENGTH) return null;
      if (!UUID_V4_REGEX.test(normalizedHeaderUserId)) return null;
      return normalizedHeaderUserId;
    }

    return null;
  } catch {
    return null;
  }
}
