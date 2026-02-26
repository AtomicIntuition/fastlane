import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fastlaneUsers } from '@/lib/db/schema';
import {
  FASTLANE_ACCOUNT_SESSION_COOKIE_NAME,
  getFastLaneAccountSessionUserIdFromRequest,
} from '@/lib/utils/fastlane-account-session-cookie';

const MAX_DELETE_REQUEST_BYTES = 2_048;

export async function GET(request: NextRequest) {
  try {
    const unknownQueryKey = Array.from(request.nextUrl.searchParams.keys())[0];
    if (unknownQueryKey !== undefined) {
      return NextResponse.json({ error: `Unknown query parameter: ${unknownQueryKey}` }, { status: 400 });
    }

    const accountUserId = getFastLaneAccountSessionUserIdFromRequest(request);
    if (!accountUserId) {
      return NextResponse.json({ authenticated: false });
    }

    const users = await db
      .select({ userId: fastlaneUsers.userId, email: fastlaneUsers.email })
      .from(fastlaneUsers)
      .where(eq(fastlaneUsers.userId, accountUserId))
      .limit(1);
    const user = users[0];

    if (!user) {
      const response = NextResponse.json({ authenticated: false });
      response.cookies.set(FASTLANE_ACCOUNT_SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
      });
      return response;
    }

    return NextResponse.json({
      authenticated: true,
      userId: user.userId,
      email: typeof user.email === 'string' ? user.email.toLowerCase() : null,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to load account session' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const unknownQueryKey = Array.from(request.nextUrl.searchParams.keys())[0];
    if (unknownQueryKey !== undefined) {
      return NextResponse.json({ error: `Unknown query parameter: ${unknownQueryKey}` }, { status: 400 });
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
      if (contentLength > MAX_DELETE_REQUEST_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
      }
      if (contentLength > 0) {
        return NextResponse.json({ error: 'Request body not allowed' }, { status: 400 });
      }
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_DELETE_REQUEST_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
    if (rawBody.length > 0) {
      return NextResponse.json({ error: 'Request body not allowed' }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(FASTLANE_ACCOUNT_SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Unable to clear account session' }, { status: 500 });
  }
}
