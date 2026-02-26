import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthorized } from '@/lib/utils/admin-session-cookie';
import { hasValidAdminCsrfRequest } from '@/lib/utils/admin-csrf';
import {
  cleanupExpiredLoginReplayMarkers,
  parseReplayCleanupLimit,
} from '@/lib/fastlane/login-token-replay-maintenance';
import { recordMaintenanceTelemetryEvent } from '@/lib/fastlane/maintenance-ops-telemetry';

const JSON_CONTENT_TYPE = 'application/json';
const MAX_REQUEST_BYTES = 4_096; // 4 KB

export async function POST(request: NextRequest) {
  try {
    if (!isAdminAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasValidAdminCsrfRequest(request)) {
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

    const body = parsedBody as { dryRun?: boolean; limit?: number | string };
    const allowedKeys = new Set(['dryRun', 'limit']);
    for (const key of Object.keys(body)) {
      if (!allowedKeys.has(key)) {
        return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 });
      }
    }

    const dryRun = body.dryRun === true;
    if (body.dryRun !== undefined && typeof body.dryRun !== 'boolean') {
      return NextResponse.json({ error: 'Invalid dryRun' }, { status: 400 });
    }

    const parsedLimit = parseReplayCleanupLimit(body.limit, 1000);
    if (parsedLimit === null) {
      return NextResponse.json({ error: 'Invalid limit' }, { status: 400 });
    }
    const result = await cleanupExpiredLoginReplayMarkers({ dryRun, limit: parsedLimit });
    await recordMaintenanceTelemetryEvent('admin_maintenance_replay_success', {
      dryRun,
      scanned: result.scanned,
      deleted: result.deleted,
      limit: parsedLimit,
    });
    return NextResponse.json(result);
  } catch {
    await recordMaintenanceTelemetryEvent('admin_maintenance_replay_failure');
    return NextResponse.json({ error: 'Unable to clean replay markers' }, { status: 500 });
  }
}
