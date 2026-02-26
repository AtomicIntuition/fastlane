import { NextRequest, NextResponse } from 'next/server';
import { isValidAdminSecret } from '@/lib/utils/admin-session-cookie';
import {
  cleanupStaleLoginRequestThrottleRows,
  parseThrottleCleanupLimit,
  parseThrottleRetentionDays,
} from '@/lib/fastlane/login-request-throttle-maintenance';

const JSON_CONTENT_TYPE = 'application/json';
const MAX_REQUEST_BYTES = 4_096; // 4 KB

function isCronAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')?.trim();
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  return isValidAdminSecret(authHeader.slice('Bearer '.length).trim());
}

export async function POST(request: NextRequest) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    const body = parsedBody as { dryRun?: boolean; limit?: number | string; retentionDays?: number | string };
    const allowedKeys = new Set(['dryRun', 'limit', 'retentionDays']);
    for (const key of Object.keys(body)) {
      if (!allowedKeys.has(key)) {
        return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 });
      }
    }

    if (body.dryRun !== undefined && typeof body.dryRun !== 'boolean') {
      return NextResponse.json({ error: 'Invalid dryRun' }, { status: 400 });
    }

    const limit = parseThrottleCleanupLimit(body.limit, 1000);
    if (limit === null) {
      return NextResponse.json({ error: 'Invalid limit' }, { status: 400 });
    }
    const retentionDays = parseThrottleRetentionDays(body.retentionDays, 30);
    if (retentionDays === null) {
      return NextResponse.json({ error: 'Invalid retentionDays' }, { status: 400 });
    }

    const result = await cleanupStaleLoginRequestThrottleRows({
      dryRun: body.dryRun === true,
      limit,
      retentionDays,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Unable to clean auth request throttle rows' }, { status: 500 });
  }
}
