import { createHmac, randomBytes } from 'crypto';

export const FASTLANE_CSRF_COOKIE_NAME = 'fastlaneCsrf';
export const FASTLANE_CSRF_HEADER_NAME = 'x-fastlane-csrf-token';

const SEPARATOR = '.';
const NONCE_HEX_LENGTH = 32;
const HMAC_HEX_LENGTH = 16;
const MAX_TOKEN_LENGTH = 128;
const HEX_PATTERN = /^[0-9a-f]+$/i;

function getCsrfSecret(): string {
  const secret = process.env.FASTLANE_CSRF_SECRET ?? process.env.USER_COOKIE_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('FASTLANE_CSRF_SECRET, USER_COOKIE_SECRET, or CRON_SECRET must be set');
  }
  return secret;
}

function signCsrfPayload(userId: string, nonce: string): string {
  return createHmac('sha256', getCsrfSecret())
    .update(`${userId}${SEPARATOR}${nonce}`)
    .digest('hex')
    .slice(0, HMAC_HEX_LENGTH);
}

export function shouldEnforceFastLaneCsrf(): boolean {
  if (process.env.FASTLANE_DISABLE_CSRF_PROTECTION === 'true') return false;
  return process.env.NODE_ENV === 'production';
}

export function generateFastLaneCsrfToken(userId: string): string {
  const nonce = randomBytes(NONCE_HEX_LENGTH / 2).toString('hex');
  const signature = signCsrfPayload(userId, nonce);
  return `${nonce}${SEPARATOR}${signature}`;
}

export function verifyFastLaneCsrfToken(token: string, userId: string): boolean {
  if (!token || token.length > MAX_TOKEN_LENGTH) return false;
  const parts = token.split(SEPARATOR);
  if (parts.length !== 2) return false;

  const [nonce, signature] = parts;
  if (!nonce || nonce.length !== NONCE_HEX_LENGTH || !HEX_PATTERN.test(nonce)) return false;
  if (!signature || signature.length !== HMAC_HEX_LENGTH || !HEX_PATTERN.test(signature)) return false;

  const expected = signCsrfPayload(userId, nonce);
  if (expected.length !== signature.length) return false;

  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export function hasValidFastLaneCsrfRequest(
  request: {
    cookies: { get: (name: string) => { value: string } | undefined };
    headers: { get: (name: string) => string | null };
  },
  userId: string,
): boolean {
  if (!shouldEnforceFastLaneCsrf()) return true;

  const cookieToken = request.cookies.get(FASTLANE_CSRF_COOKIE_NAME)?.value?.trim();
  const headerToken = request.headers.get(FASTLANE_CSRF_HEADER_NAME)?.trim();

  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length > MAX_TOKEN_LENGTH || headerToken.length > MAX_TOKEN_LENGTH) return false;
  if (cookieToken !== headerToken) return false;

  return verifyFastLaneCsrfToken(cookieToken, userId);
}
