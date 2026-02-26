import { createHmac, randomBytes } from 'crypto';
import { type NextRequest } from 'next/server';
import { ADMIN_SESSION_COOKIE_NAME, isValidAdminSecret } from './admin-session-cookie';

export const ADMIN_CSRF_COOKIE_NAME = 'fastlaneAdminCsrf';
export const ADMIN_CSRF_HEADER_NAME = 'x-fastlane-admin-csrf-token';

const SEPARATOR = '.';
const NONCE_HEX_LENGTH = 32;
const HMAC_HEX_LENGTH = 16;
const MAX_TOKEN_LENGTH = 128;
const HEX_PATTERN = /^[0-9a-f]+$/i;
const MAX_SESSION_VALUE_LENGTH = 256;

function getAdminCsrfSecret(): string {
  const secret = process.env.ADMIN_CSRF_SECRET ?? process.env.ADMIN_SESSION_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('ADMIN_CSRF_SECRET, ADMIN_SESSION_SECRET, or CRON_SECRET must be set');
  }
  return secret;
}

function signAdminCsrfPayload(sessionValue: string, nonce: string): string {
  return createHmac('sha256', getAdminCsrfSecret())
    .update(`${sessionValue}${SEPARATOR}${nonce}`)
    .digest('hex')
    .slice(0, HMAC_HEX_LENGTH);
}

export function shouldEnforceAdminCsrf(): boolean {
  if (process.env.FASTLANE_DISABLE_ADMIN_CSRF_PROTECTION === 'true') return false;
  return process.env.NODE_ENV === 'production';
}

export function generateAdminCsrfToken(sessionValue: string): string {
  const normalizedSessionValue = sessionValue.trim();
  const nonce = randomBytes(NONCE_HEX_LENGTH / 2).toString('hex');
  const signature = signAdminCsrfPayload(normalizedSessionValue, nonce);
  return `${nonce}${SEPARATOR}${signature}`;
}

function verifyAdminCsrfToken(token: string, sessionValue: string): boolean {
  if (!token || token.length > MAX_TOKEN_LENGTH) return false;
  const parts = token.split(SEPARATOR);
  if (parts.length !== 2) return false;
  const [nonce, signature] = parts;
  if (!nonce || nonce.length !== NONCE_HEX_LENGTH || !HEX_PATTERN.test(nonce)) return false;
  if (!signature || signature.length !== HMAC_HEX_LENGTH || !HEX_PATTERN.test(signature)) return false;

  const expected = signAdminCsrfPayload(sessionValue, nonce);
  if (expected.length !== signature.length) return false;

  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export function hasValidAdminCsrfRequest(request: NextRequest): boolean {
  if (!shouldEnforceAdminCsrf()) return true;

  const authHeader = request.headers.get('authorization')?.trim();
  if (authHeader?.startsWith('Bearer ')) {
    const secret = authHeader.slice('Bearer '.length).trim();
    if (isValidAdminSecret(secret)) return true;
  }

  const sessionValue = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value?.trim();
  const cookieToken = request.cookies.get(ADMIN_CSRF_COOKIE_NAME)?.value?.trim();
  const headerToken = request.headers.get(ADMIN_CSRF_HEADER_NAME)?.trim();

  if (!sessionValue || !cookieToken || !headerToken) return false;
  if (sessionValue.length > MAX_SESSION_VALUE_LENGTH) return false;
  if (cookieToken.length > MAX_TOKEN_LENGTH || headerToken.length > MAX_TOKEN_LENGTH) return false;
  if (cookieToken !== headerToken) return false;

  return verifyAdminCsrfToken(cookieToken, sessionValue);
}
