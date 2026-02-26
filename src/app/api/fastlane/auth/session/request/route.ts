import { NextRequest, NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fastlaneLoginRequestThrottle, fastlaneUsers } from '@/lib/db/schema';
import { createFastLaneLoginToken } from '@/lib/utils/fastlane-auth-token';
import { isFastLaneAuthEmailConfigured, sendFastLaneLoginEmail } from '@/lib/fastlane/auth-email';

const JSON_CONTENT_TYPE = 'application/json';
const MAX_REQUEST_BYTES = 4_096; // 4 KB
const EMAIL_MAX_LENGTH = 255;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_REQUEST_COOLDOWN_SECONDS = 60;

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > EMAIL_MAX_LENGTH) return null;
  if (!EMAIL_REGEX.test(normalized)) return null;
  return normalized;
}

export async function POST(request: NextRequest) {
  try {
    const emailDeliveryConfigured = isFastLaneAuthEmailConfigured();
    if (process.env.NODE_ENV === 'production' && !emailDeliveryConfigured) {
      return NextResponse.json({ error: 'Auth email delivery not configured' }, { status: 500 });
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
      if (contentLength > MAX_REQUEST_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
      }
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_REQUEST_BYTES) {
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

    const now = new Date();
    const recentThrottleRows = await db
      .select({ lastRequestedAt: fastlaneLoginRequestThrottle.lastRequestedAt })
      .from(fastlaneLoginRequestThrottle)
      .where(eq(fastlaneLoginRequestThrottle.email, email))
      .limit(1);
    const recentThrottle = recentThrottleRows[0];
    if (recentThrottle?.lastRequestedAt) {
      const elapsedMs = now.getTime() - recentThrottle.lastRequestedAt.getTime();
      const remainingSeconds = Math.ceil((LOGIN_REQUEST_COOLDOWN_SECONDS * 1000 - elapsedMs) / 1000);
      if (remainingSeconds > 0) {
        return NextResponse.json({
          ok: true,
          throttled: true,
          retryAfterSeconds: remainingSeconds,
        });
      }
    }

    await db
      .insert(fastlaneLoginRequestThrottle)
      .values({
        email,
        lastRequestedAt: now,
        requestCount: 1,
      })
      .onConflictDoUpdate({
        target: fastlaneLoginRequestThrottle.email,
        set: {
          lastRequestedAt: now,
          requestCount: sql`${fastlaneLoginRequestThrottle.requestCount} + 1`,
        },
      });

    const rows = await db
      .select({ userId: fastlaneUsers.userId, email: fastlaneUsers.email })
      .from(fastlaneUsers)
      .where(eq(fastlaneUsers.email, email))
      .limit(1);
    const user = rows[0];

    if (!user) {
      return NextResponse.json({ ok: true });
    }

    const loginToken = createFastLaneLoginToken({ userId: user.userId, email });
    if (emailDeliveryConfigured) {
      await sendFastLaneLoginEmail({
        toEmail: email,
        token: loginToken,
        requestOrigin: request.nextUrl.origin,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true, devLoginToken: loginToken, expiresInSeconds: 600 });
  } catch {
    return NextResponse.json({ error: 'Unable to create login request' }, { status: 500 });
  }
}
