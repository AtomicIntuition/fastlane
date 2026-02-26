import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fastlaneUsers } from '@/lib/db/schema';
import { ensureFastLaneUser, requireFastLaneUserId, unauthorized } from '@/lib/fastlane/server';
import { hasValidFastLaneCsrfRequest } from '@/lib/utils/fastlane-csrf';
import {
  createFastLaneAccountSessionCookieValue,
  FASTLANE_ACCOUNT_SESSION_COOKIE_NAME,
} from '@/lib/utils/fastlane-account-session-cookie';

const JSON_CONTENT_TYPE = 'application/json';
const MAX_LINK_REQUEST_BYTES = 4_096; // 4 KB
const EMAIL_MAX_LENGTH = 255;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.length > EMAIL_MAX_LENGTH) return null;
  if (!EMAIL_REGEX.test(normalized)) return null;
  return normalized;
}

export async function GET(request: NextRequest) {
  try {
    const userId = requireFastLaneUserId(request);
    if (!userId) return unauthorized();

    const unknownQueryKey = Array.from(request.nextUrl.searchParams.keys())[0];
    if (unknownQueryKey !== undefined) {
      return NextResponse.json({ error: `Unknown query parameter: ${unknownQueryKey}` }, { status: 400 });
    }

    const user = await ensureFastLaneUser(userId);
    const email = normalizeEmail(user.email) ?? null;
    return NextResponse.json({ linked: !!email, email });
  } catch {
    return NextResponse.json({ error: 'Unable to load account link status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = requireFastLaneUserId(request);
    if (!userId) return unauthorized();
    if (!hasValidFastLaneCsrfRequest(request, userId)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    }

    const unknownQueryKey = Array.from(request.nextUrl.searchParams.keys())[0];
    if (unknownQueryKey !== undefined) {
      return NextResponse.json({ error: `Unknown query parameter: ${unknownQueryKey}` }, { status: 400 });
    }

    const contentTypeHeader = request.headers.get('content-type')?.trim().toLowerCase() ?? '';
    const contentType = contentTypeHeader.split(';', 1)[0]?.trim() ?? '';
    if (contentType !== JSON_CONTENT_TYPE) {
      return NextResponse.json({ error: 'Invalid content-type header' }, { status: 400 });
    }

    const contentLengthHeader = request.headers.get('content-length');
    if (contentLengthHeader !== null) {
      const normalizedContentLength = contentLengthHeader.trim();
      if (!/^\d+$/.test(normalizedContentLength)) {
        return NextResponse.json({ error: 'Invalid content-length header' }, { status: 400 });
      }
      const contentLength = Number(normalizedContentLength);
      if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
        return NextResponse.json({ error: 'Invalid content-length header' }, { status: 400 });
      }
      if (contentLength > MAX_LINK_REQUEST_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
      }
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_LINK_REQUEST_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    let parsedBody: unknown = null;
    if (rawBody.length > 0) {
      try {
        parsedBody = JSON.parse(rawBody) as unknown;
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
    }
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const body = parsedBody as { email?: unknown };
    const bodyKeys = Object.keys(body);
    if (bodyKeys.length !== 1 || bodyKeys[0] !== 'email') {
      const badKey = bodyKeys.find((k) => k !== 'email') ?? 'email';
      return NextResponse.json({ error: `Unknown field: ${badKey}` }, { status: 400 });
    }

    const email = normalizeEmail(body.email);
    if (!email) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const user = await ensureFastLaneUser(userId);
    const existingUserEmail = normalizeEmail(user.email);
    if (existingUserEmail === email) {
      const response = NextResponse.json({ ok: true, linked: true, email });
      response.cookies.set(
        FASTLANE_ACCOUNT_SESSION_COOKIE_NAME,
        createFastLaneAccountSessionCookieValue(userId),
        {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 60 * 60 * 24 * 30,
        },
      );
      return response;
    }

    const existingByEmail = await db
      .select({ userId: fastlaneUsers.userId })
      .from(fastlaneUsers)
      .where(eq(fastlaneUsers.email, email))
      .limit(1);

    if (existingByEmail[0] && existingByEmail[0].userId !== userId) {
      return NextResponse.json({ error: 'Email already linked to another account' }, { status: 409 });
    }

    await db
      .update(fastlaneUsers)
      .set({ email, updatedAt: new Date() })
      .where(eq(fastlaneUsers.userId, userId));

    const response = NextResponse.json({ ok: true, linked: true, email });
    response.cookies.set(
      FASTLANE_ACCOUNT_SESSION_COOKIE_NAME,
      createFastLaneAccountSessionCookieValue(userId),
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      },
    );
    return response;
  } catch {
    return NextResponse.json({ error: 'Unable to link account' }, { status: 500 });
  }
}
