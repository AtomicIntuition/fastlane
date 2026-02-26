import { createHmac } from 'crypto';

export const FASTLANE_ACCOUNT_SESSION_COOKIE_NAME = 'fastlaneAccount';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAX_COOKIE_LENGTH = 320;
const MAX_USER_ID_LENGTH = 100;
const MAX_EXPIRES_AT_LENGTH = 13;
const SIG_REGEX = /^[0-9a-f]{24}$/i;
const USER_ID_REGEX = /^[A-Za-z0-9_-]+$/;

function getSecret(): string {
  const secret =
    process.env.FASTLANE_ACCOUNT_SESSION_SECRET ?? process.env.USER_COOKIE_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    throw new Error(
      'FASTLANE_ACCOUNT_SESSION_SECRET, USER_COOKIE_SECRET, or CRON_SECRET must be set',
    );
  }
  return secret;
}

function sign(userId: string, expiresAtMs: number): string {
  return createHmac('sha256', getSecret())
    .update(`${userId}.${expiresAtMs}`)
    .digest('hex')
    .slice(0, 24);
}

function isValidUserId(userId: string): boolean {
  if (!userId || userId.length > MAX_USER_ID_LENGTH) return false;
  return USER_ID_REGEX.test(userId);
}

export function createFastLaneAccountSessionCookieValue(
  userId: string,
  now = Date.now(),
): string {
  if (!isValidUserId(userId)) {
    throw new Error('Invalid user id for account session cookie');
  }
  const expiresAtMs = now + SESSION_TTL_SECONDS * 1000;
  return `${userId}.${expiresAtMs}.${sign(userId, expiresAtMs)}`;
}

export function verifyFastLaneAccountSessionCookieValue(
  value: string,
  now = Date.now(),
): string | null {
  try {
    if (!value || value.length > MAX_COOKIE_LENGTH) return null;
    const parts = value.split('.');
    if (parts.length !== 3) return null;

    const [userId, expiresAtRaw, providedSig] = parts;
    if (!isValidUserId(userId)) return null;
    if (!expiresAtRaw || expiresAtRaw.length > MAX_EXPIRES_AT_LENGTH) return null;
    if (!/^\d+$/.test(expiresAtRaw)) return null;
    if (!providedSig || !SIG_REGEX.test(providedSig)) return null;

    const expiresAt = Number(expiresAtRaw);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;

    const expectedSig = sign(userId, expiresAt);
    if (expectedSig.length !== providedSig.length) return null;

    let mismatch = 0;
    for (let i = 0; i < expectedSig.length; i++) {
      mismatch |= expectedSig.charCodeAt(i) ^ providedSig.charCodeAt(i);
    }
    return mismatch === 0 ? userId : null;
  } catch {
    return null;
  }
}

export function getFastLaneAccountSessionUserIdFromRequest(request: {
  cookies: { get: (name: string) => { value: string } | undefined };
}): string | null {
  try {
    const cookie = request.cookies.get(FASTLANE_ACCOUNT_SESSION_COOKIE_NAME)?.value;
    if (!cookie) return null;
    return verifyFastLaneAccountSessionCookieValue(cookie);
  } catch {
    return null;
  }
}
