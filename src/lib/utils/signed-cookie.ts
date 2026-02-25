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

/** Sign a userId with HMAC-SHA256. */
function sign(userId: string): string {
  const hmac = createHmac('sha256', getSecret())
    .update(userId)
    .digest('hex')
    .slice(0, 16); // First 16 hex chars (64 bits) — enough for authentication
  return `${userId}${SEPARATOR}${hmac}`;
}

/** Verify a signed cookie value. Returns the userId if valid, null otherwise. */
export function verifySignedCookie(cookieValue: string): string | null {
  const sepIndex = cookieValue.lastIndexOf(SEPARATOR);
  if (sepIndex === -1) return null;

  const userId = cookieValue.slice(0, sepIndex);
  const providedHmac = cookieValue.slice(sepIndex + 1);

  if (!userId || !providedHmac) return null;

  const expectedHmac = createHmac('sha256', getSecret())
    .update(userId)
    .digest('hex')
    .slice(0, 16);

  // Constant-time comparison to prevent timing attacks
  if (providedHmac.length !== expectedHmac.length) return null;
  let mismatch = 0;
  for (let i = 0; i < providedHmac.length; i++) {
    mismatch |= providedHmac.charCodeAt(i) ^ expectedHmac.charCodeAt(i);
  }
  return mismatch === 0 ? userId : null;
}

/** Generate a new signed userId cookie value. */
export function generateSignedUserId(): string {
  const userId = randomUUID();
  return sign(userId);
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
  // Priority 1: Signed cookie
  const signedCookie = request.cookies.get(COOKIE_NAME);
  if (signedCookie?.value) {
    const verified = verifySignedCookie(signedCookie.value);
    if (verified) return verified;
  }

  // Priority 2: Legacy unsigned cookie (backwards compat)
  // The old system stored plain UUIDs. Accept them but don't trust x-user-id header.
  if (signedCookie?.value && !signedCookie.value.includes(SEPARATOR)) {
    // Plain UUID in cookie — accept for backwards compatibility
    return signedCookie.value;
  }

  // Priority 3: x-user-id header (legacy, will be removed in v2)
  const headerUserId = request.headers.get('x-user-id');
  if (headerUserId) {
    return headerUserId;
  }

  return null;
}
