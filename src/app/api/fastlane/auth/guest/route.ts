import { NextRequest, NextResponse } from 'next/server';
import {
  COOKIE_NAME,
  generateSignedUserId,
  getUserIdFromSignedCookieValue,
  verifySignedCookie,
} from '@/lib/utils/signed-cookie';
import {
  FASTLANE_CSRF_COOKIE_NAME,
  generateFastLaneCsrfToken,
  verifyFastLaneCsrfToken,
} from '@/lib/utils/fastlane-csrf';
import { FASTLANE_ACCOUNT_SESSION_COOKIE_NAME } from '@/lib/utils/fastlane-account-session-cookie';

const JSON_CONTENT_TYPE = 'application/json';
const MAX_GUEST_AUTH_REQUEST_BYTES = 2_048; // 2 KB

export async function POST(request: NextRequest) {
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
      if (contentLength > MAX_GUEST_AUTH_REQUEST_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
      }
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_GUEST_AUTH_REQUEST_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    if (rawBody.length > 0) {
      const contentTypeHeader = request.headers.get('content-type')?.trim().toLowerCase() ?? '';
      const contentType = contentTypeHeader.split(';', 1)[0]?.trim() ?? '';
      if (contentType !== JSON_CONTENT_TYPE) {
        return NextResponse.json({ error: 'Invalid content-type header' }, { status: 400 });
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(rawBody) as unknown;
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      const bodyKeys = Object.keys(parsedBody as Record<string, unknown>);
      if (bodyKeys.length > 0) {
        return NextResponse.json({ error: `Unknown field: ${bodyKeys[0]}` }, { status: 400 });
      }
    }

    const existing = request.cookies.get(COOKIE_NAME)?.value;
    if (existing) {
      const verifiedUserId = verifySignedCookie(existing);
      if (verifiedUserId) {
        const response = NextResponse.json({ userId: verifiedUserId });
        const existingCsrf = request.cookies.get(FASTLANE_CSRF_COOKIE_NAME)?.value;
        if (!existingCsrf || !verifyFastLaneCsrfToken(existingCsrf, verifiedUserId)) {
          const csrfToken = generateFastLaneCsrfToken(verifiedUserId);
          response.cookies.set(FASTLANE_CSRF_COOKIE_NAME, csrfToken, {
            httpOnly: false,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 60 * 60 * 24 * 365,
          });
        }
        return response;
      }
    }

    const signed = generateSignedUserId();
    const userId = getUserIdFromSignedCookieValue(signed);
    if (!userId) {
      return NextResponse.json({ error: 'Unable to create guest session' }, { status: 500 });
    }

    const response = NextResponse.json({ userId });
    const csrfToken = generateFastLaneCsrfToken(userId);
    response.cookies.set(COOKIE_NAME, signed, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    response.cookies.set(FASTLANE_CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Unable to create guest session' }, { status: 500 });
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
      if (contentLength > 0) {
        return NextResponse.json({ error: 'Request body not allowed' }, { status: 400 });
      }
    }

    const rawBody = await request.text();
    if (rawBody.length > 0) {
      return NextResponse.json({ error: 'Request body not allowed' }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
    response.cookies.set(FASTLANE_CSRF_COOKIE_NAME, '', {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
    response.cookies.set(FASTLANE_ACCOUNT_SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Unable to clear guest session' }, { status: 500 });
  }
}
