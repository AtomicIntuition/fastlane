import { createHmac, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

export const ADMIN_SESSION_COOKIE_NAME = 'fastlane_admin_session';

const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours
const MAX_ADMIN_SESSION_COOKIE_LENGTH = 256;
const ADMIN_SESSION_SIG_REGEX = /^[0-9a-f]{24}$/i;
const MAX_ADMIN_SECRET_INPUT_LENGTH = 256;
const MAX_AUTH_HEADER_LENGTH = 512;

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET or CRON_SECRET must be set');
  }
  return secret;
}

function sign(expiresAtMs: number): string {
  return createHmac('sha256', getSecret())
    .update(String(expiresAtMs))
    .digest('hex')
    .slice(0, 24);
}

export function createAdminSessionCookieValue(now = Date.now()): string {
  const expiresAt = now + SESSION_TTL_MS;
  const sig = sign(expiresAt);
  return `${expiresAt}.${sig}`;
}

export function verifyAdminSessionCookieValue(value: string, now = Date.now()): boolean {
  try {
    if (value.length > MAX_ADMIN_SESSION_COOKIE_LENGTH) return false;

    const parts = value.split('.');
    if (parts.length !== 2) return false;

    const [expiresAtRaw, providedSig] = parts;
    if (!expiresAtRaw || !providedSig) return false;
    if (!ADMIN_SESSION_SIG_REGEX.test(providedSig)) return false;

    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt)) return false;
    if (expiresAt <= now) return false;

    const expectedSig = sign(expiresAt);
    if (expectedSig.length !== providedSig.length) return false;

    let mismatch = 0;
    for (let i = 0; i < expectedSig.length; i++) {
      mismatch |= expectedSig.charCodeAt(i) ^ providedSig.charCodeAt(i);
    }

    return mismatch === 0;
  } catch {
    return false;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length > MAX_AUTH_HEADER_LENGTH || b.length > MAX_AUTH_HEADER_LENGTH) {
    return false;
  }
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isValidAdminSecret(secret: string | undefined | null): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!secret || !cronSecret) return false;
  if (secret.length > MAX_ADMIN_SECRET_INPUT_LENGTH) return false;
  if (cronSecret.length > MAX_ADMIN_SECRET_INPUT_LENGTH) return false;
  return constantTimeEquals(secret, cronSecret);
}

export function isAdminAuthorized(request: NextRequest): boolean {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (
      authHeader &&
      cronSecret &&
      authHeader.length <= MAX_AUTH_HEADER_LENGTH &&
      constantTimeEquals(authHeader, `Bearer ${cronSecret}`)
    ) {
      return true;
    }

    const cookieValue = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
    if (!cookieValue) return false;
    return verifyAdminSessionCookieValue(cookieValue);
  } catch {
    return false;
  }
}
