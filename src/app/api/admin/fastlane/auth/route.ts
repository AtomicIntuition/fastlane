import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSessionCookieValue,
  isValidAdminSecret,
  isAdminAuthorized,
} from '@/lib/utils/admin-session-cookie';
import { ADMIN_CSRF_COOKIE_NAME, generateAdminCsrfToken } from '@/lib/utils/admin-csrf';

const JSON_CONTENT_TYPE = 'application/json';
const MAX_ADMIN_AUTH_REQUEST_BYTES = 2_048; // 2 KB

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
      if (contentLength > MAX_ADMIN_AUTH_REQUEST_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
      }
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_ADMIN_AUTH_REQUEST_BYTES) {
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
    const body = parsedBody as { secret?: string };
    const bodyKeys = Object.keys(body);
    for (const key of bodyKeys) {
      if (key !== 'secret') {
        return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 });
      }
    }
    if (!isValidAdminSecret(body.secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionCookieValue = createAdminSessionCookieValue();
    const csrfToken = generateAdminCsrfToken(sessionCookieValue);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_SESSION_COOKIE_NAME, sessionCookieValue, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 8,
    });
    response.cookies.set(ADMIN_CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Unable to create admin session' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const unknownQueryKey = Array.from(request.nextUrl.searchParams.keys())[0];
  if (unknownQueryKey !== undefined) {
    return NextResponse.json({ error: `Unknown query parameter: ${unknownQueryKey}` }, { status: 400 });
  }
  const authorized = isAdminAuthorized(request);
  const response = NextResponse.json({ authenticated: authorized });
  if (authorized) {
    const sessionCookieValue = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value?.trim();
    if (sessionCookieValue) {
      response.cookies.set(ADMIN_CSRF_COOKIE_NAME, generateAdminCsrfToken(sessionCookieValue), {
        httpOnly: false,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 8,
      });
    }
  }
  return response;
}

export async function DELETE(request: NextRequest) {
  const unknownQueryKey = Array.from(request.nextUrl.searchParams.keys())[0];
  if (unknownQueryKey !== undefined) {
    return NextResponse.json({ error: `Unknown query parameter: ${unknownQueryKey}` }, { status: 400 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(ADMIN_CSRF_COOKIE_NAME, '', {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
