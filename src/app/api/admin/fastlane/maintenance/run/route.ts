import { NextRequest, NextResponse } from 'next/server';
import { hasValidAdminCsrfRequest } from '@/lib/utils/admin-csrf';
import { isAdminAuthorized } from '@/lib/utils/admin-session-cookie';
import { cleanupExpiredLoginReplayMarkers } from '@/lib/fastlane/login-token-replay-maintenance';
import { cleanupStaleLoginRequestThrottleRows } from '@/lib/fastlane/login-request-throttle-maintenance';
import { recordMaintenanceTelemetryEvent } from '@/lib/fastlane/maintenance-ops-telemetry';

const JSON_CONTENT_TYPE = 'application/json';
const MAX_REQUEST_BYTES = 8_192; // 8 KB

function toPositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

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

    const body = parsedBody as {
      dryRun?: boolean;
      replayLimit?: number | string;
      throttleLimit?: number | string;
      throttleRetentionDays?: number | string;
    };
    const allowedKeys = new Set(['dryRun', 'replayLimit', 'throttleLimit', 'throttleRetentionDays']);
    for (const key of Object.keys(body)) {
      if (!allowedKeys.has(key)) {
        return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 });
      }
    }

    if (body.dryRun !== undefined && typeof body.dryRun !== 'boolean') {
      return NextResponse.json({ error: 'Invalid dryRun' }, { status: 400 });
    }

    const replayLimit = toPositiveInt(body.replayLimit ?? 1000);
    if (replayLimit === null || replayLimit > 10_000) {
      return NextResponse.json({ error: 'Invalid replayLimit' }, { status: 400 });
    }
    const throttleLimit = toPositiveInt(body.throttleLimit ?? 1000);
    if (throttleLimit === null || throttleLimit > 10_000) {
      return NextResponse.json({ error: 'Invalid throttleLimit' }, { status: 400 });
    }
    const throttleRetentionDays = toPositiveInt(body.throttleRetentionDays ?? 30);
    if (
      throttleRetentionDays === null ||
      throttleRetentionDays < 1 ||
      throttleRetentionDays > 365
    ) {
      return NextResponse.json({ error: 'Invalid throttleRetentionDays' }, { status: 400 });
    }

    const dryRun = body.dryRun === true;
    const startedAt = Date.now();

    const [replay, throttle] = await Promise.all([
      cleanupExpiredLoginReplayMarkers({ dryRun, limit: replayLimit }),
      cleanupStaleLoginRequestThrottleRows({
        dryRun,
        limit: throttleLimit,
        retentionDays: throttleRetentionDays,
      }),
    ]);

    await recordMaintenanceTelemetryEvent('admin_maintenance_run_success', {
      dryRun,
      replayScanned: replay.scanned,
      replayDeleted: replay.deleted,
      throttleScanned: throttle.scanned,
      throttleDeleted: throttle.deleted,
      replayLimit,
      throttleLimit,
      throttleRetentionDays,
    });

    return NextResponse.json({
      ok: true,
      dryRun,
      durationMs: Date.now() - startedAt,
      maintenance: {
        replay,
        throttle,
      },
    });
  } catch {
    await recordMaintenanceTelemetryEvent('admin_maintenance_run_failure');
    return NextResponse.json({ error: 'Unable to run maintenance' }, { status: 500 });
  }
}
