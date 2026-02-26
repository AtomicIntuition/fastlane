import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fastlaneUsers } from '@/lib/db/schema';
import {
  createFastLaneAccountSessionCookieValue,
  FASTLANE_ACCOUNT_SESSION_COOKIE_NAME,
} from '@/lib/utils/fastlane-account-session-cookie';
import { verifyFastLaneLoginToken } from '@/lib/utils/fastlane-auth-token';
import { markLoginTokenConsumed } from '@/lib/fastlane/login-token-replay';

const JSON_CONTENT_TYPE = 'application/json';
const MAX_REQUEST_BYTES = 4_096; // 4 KB
const MAX_TOKEN_LENGTH = 1024;

export async function POST(request: NextRequest) {
  try {
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

    const body = parsedBody as { token?: unknown };
    const bodyKeys = Object.keys(body);
    if (bodyKeys.length !== 1 || bodyKeys[0] !== 'token') {
      const badKey = bodyKeys.find((k) => k !== 'token') ?? 'token';
      return NextResponse.json({ error: `Unknown field: ${badKey}` }, { status: 400 });
    }

    if (typeof body.token !== 'string') {
      return NextResponse.json({ error: 'Invalid login token' }, { status: 400 });
    }
    const token = body.token.trim();
    if (!token || token.length > MAX_TOKEN_LENGTH) {
      return NextResponse.json({ error: 'Invalid login token' }, { status: 400 });
    }

    const payload = verifyFastLaneLoginToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired login token' }, { status: 400 });
    }
    const users = await db
      .select({
        userId: fastlaneUsers.userId,
        email: fastlaneUsers.email,
      })
      .from(fastlaneUsers)
      .where(
        and(
          eq(fastlaneUsers.userId, payload.userId),
          isNotNull(fastlaneUsers.email),
          eq(fastlaneUsers.email, payload.email),
        ),
      )
      .limit(1);
    const user = users[0];

    if (!user?.email) {
      return NextResponse.json({ error: 'Invalid or expired login token' }, { status: 400 });
    }

    const consumed = await markLoginTokenConsumed(token, payload.expiresAtMs);
    if (!consumed) {
      return NextResponse.json({ error: 'Login token already used' }, { status: 409 });
    }

    const response = NextResponse.json({
      ok: true,
      authenticated: true,
      userId: user.userId,
      email: user.email.toLowerCase(),
    });
    response.cookies.set(
      FASTLANE_ACCOUNT_SESSION_COOKIE_NAME,
      createFastLaneAccountSessionCookieValue(user.userId),
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
    return NextResponse.json({ error: 'Unable to verify login token' }, { status: 500 });
  }
}
