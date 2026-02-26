import { createHmac } from 'crypto';

const LOGIN_TOKEN_TTL_SECONDS = 60 * 10; // 10 minutes
const MAX_TOKEN_LENGTH = 1024;
const MAX_USER_ID_LENGTH = 100;
const MAX_EMAIL_LENGTH = 255;
const USER_ID_REGEX = /^[A-Za-z0-9_-]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HMAC_REGEX = /^[0-9a-f]{24}$/i;

export type FastLaneLoginTokenPayload = {
  userId: string;
  email: string;
  expiresAtMs: number;
};

function getSecret(): string {
  const secret =
    process.env.FASTLANE_LOGIN_TOKEN_SECRET ??
    process.env.FASTLANE_ACCOUNT_SESSION_SECRET ??
    process.env.USER_COOKIE_SECRET ??
    process.env.CRON_SECRET;
  if (!secret) {
    throw new Error(
      'FASTLANE_LOGIN_TOKEN_SECRET, FASTLANE_ACCOUNT_SESSION_SECRET, USER_COOKIE_SECRET, or CRON_SECRET must be set',
    );
  }
  return secret;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidPayloadInput(userId: string, email: string): boolean {
  if (!userId || userId.length > MAX_USER_ID_LENGTH) return false;
  if (!USER_ID_REGEX.test(userId)) return false;
  if (!email || email.length > MAX_EMAIL_LENGTH) return false;
  if (!EMAIL_REGEX.test(email)) return false;
  return true;
}

function sign(payloadBase64Url: string): string {
  return createHmac('sha256', getSecret()).update(payloadBase64Url).digest('hex').slice(0, 24);
}

export function createFastLaneLoginToken(input: {
  userId: string;
  email: string;
  nowMs?: number;
}): string {
  const userId = input.userId.trim();
  const email = normalizeEmail(input.email);
  if (!isValidPayloadInput(userId, email)) {
    throw new Error('Invalid login token payload');
  }

  const nowMs = input.nowMs ?? Date.now();
  const expiresAtMs = nowMs + LOGIN_TOKEN_TTL_SECONDS * 1000;
  const payloadRaw = JSON.stringify({ u: userId, e: email, exp: expiresAtMs });
  const payloadBase64Url = Buffer.from(payloadRaw, 'utf8').toString('base64url');
  const signature = sign(payloadBase64Url);
  return `${payloadBase64Url}.${signature}`;
}

export function verifyFastLaneLoginToken(
  token: string,
  nowMs = Date.now(),
): FastLaneLoginTokenPayload | null {
  try {
    if (!token || token.length > MAX_TOKEN_LENGTH) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadBase64Url, providedSig] = parts;
    if (!payloadBase64Url || !providedSig || !HMAC_REGEX.test(providedSig)) return null;

    const expectedSig = sign(payloadBase64Url);
    if (expectedSig.length !== providedSig.length) return null;
    let mismatch = 0;
    for (let i = 0; i < expectedSig.length; i++) {
      mismatch |= expectedSig.charCodeAt(i) ^ providedSig.charCodeAt(i);
    }
    if (mismatch !== 0) return null;

    const payloadRaw = Buffer.from(payloadBase64Url, 'base64url').toString('utf8');
    const parsed = JSON.parse(payloadRaw) as { u?: unknown; e?: unknown; exp?: unknown };
    if (typeof parsed.u !== 'string' || typeof parsed.e !== 'string' || typeof parsed.exp !== 'number') {
      return null;
    }

    const userId = parsed.u.trim();
    const email = normalizeEmail(parsed.e);
    if (!isValidPayloadInput(userId, email)) return null;
    if (!Number.isSafeInteger(parsed.exp) || parsed.exp <= nowMs) return null;

    return { userId, email, expiresAtMs: parsed.exp };
  } catch {
    return null;
  }
}
