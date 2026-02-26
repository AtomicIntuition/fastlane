import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fastlaneWebhookEvents } from '@/lib/db/schema';
import {
  processFastLaneStripeEvent,
  type StripeWebhookEvent,
} from '@/lib/fastlane/webhook-processor';
import { isAdminAuthorized } from '@/lib/utils/admin-session-cookie';
import { hasValidAdminCsrfRequest } from '@/lib/utils/admin-csrf';

const JSON_CONTENT_TYPE = 'application/json';
const STRIPE_EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_]+$/;
const ADMIN_REPLAYED_BY_PATTERN = /^[A-Za-z0-9@._ -]+$/;
const MAX_STORED_REPLAY_ERROR_LENGTH = 1000;
const MAX_REPROCESS_REQUEST_BYTES = 16_384; // 16 KB

function isValidReplayedBy(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return false;
  if (!ADMIN_REPLAYED_BY_PATTERN.test(trimmed)) return false;
  return true;
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function normalizeReplayErrorMessage(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error)).trim();
  const safe = message.length > 0 ? message : 'Unknown replay error';
  return safe.slice(0, MAX_STORED_REPLAY_ERROR_LENGTH);
}

export async function GET(request: NextRequest) {
  try {
    if (!isAdminAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const unknownQueryKey = Array.from(request.nextUrl.searchParams.keys()).find(
      (key) => key !== 'limit',
    );
    if (unknownQueryKey !== undefined) {
      return NextResponse.json({ error: `Unknown query parameter: ${unknownQueryKey}` }, { status: 400 });
    }

    const limitRaw = request.nextUrl.searchParams.get('limit');
    const parsedLimit = limitRaw === null ? 25 : toPositiveInt(limitRaw);
    if (limitRaw !== null && parsedLimit === null) {
      return NextResponse.json({ error: 'Invalid limit' }, { status: 400 });
    }
    if (parsedLimit !== null && parsedLimit > 100) {
      return NextResponse.json({ error: 'Invalid limit' }, { status: 400 });
    }
    const limit = Math.min(100, parsedLimit ?? 25);

    const rows = await db
      .select()
      .from(fastlaneWebhookEvents)
      .where(and(eq(fastlaneWebhookEvents.processed, false), isNotNull(fastlaneWebhookEvents.error)))
      .orderBy(desc(fastlaneWebhookEvents.createdAt))
      .limit(limit);

    return NextResponse.json({
      failedEvents: rows.map((row) => ({
        id: row.id,
        stripeEventId: row.stripeEventId,
        eventType: row.eventType,
        error: row.error,
        replayCount: row.replayCount,
        lastReplayAt: row.lastReplayAt,
        lastReplayedBy: row.lastReplayedBy,
        createdAt: row.createdAt,
      })),
    });
  } catch {
    return NextResponse.json({ error: 'Unable to load failed events' }, { status: 500 });
  }
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
      if (contentLength > MAX_REPROCESS_REQUEST_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
      }
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_REPROCESS_REQUEST_BYTES) {
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
      stripeEventId?: string;
      limit?: number;
      replayedBy?: string;
      force?: boolean;
    };
    const allowedKeys = new Set(['stripeEventId', 'limit', 'replayedBy', 'force']);
    for (const key of Object.keys(body)) {
      if (!allowedKeys.has(key)) {
        return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 });
      }
    }
    if (body.stripeEventId !== undefined && (typeof body.stripeEventId !== 'string' || body.stripeEventId.trim().length === 0)) {
      return NextResponse.json({ error: 'Invalid stripeEventId' }, { status: 400 });
    }
    if (
      typeof body.stripeEventId === 'string' &&
      (body.stripeEventId.trim().length > 100 ||
        !STRIPE_EVENT_ID_PATTERN.test(body.stripeEventId.trim()))
    ) {
      return NextResponse.json({ error: 'Invalid stripeEventId' }, { status: 400 });
    }
    if (body.limit !== undefined && toPositiveInt(body.limit) === null) {
      return NextResponse.json({ error: 'Invalid limit' }, { status: 400 });
    }
    if (body.limit !== undefined && (toPositiveInt(body.limit) ?? 0) > 100) {
      return NextResponse.json({ error: 'Invalid limit' }, { status: 400 });
    }
    if (body.replayedBy !== undefined && typeof body.replayedBy !== 'string') {
      return NextResponse.json({ error: 'Invalid replayedBy' }, { status: 400 });
    }
    if (typeof body.replayedBy === 'string' && !isValidReplayedBy(body.replayedBy)) {
      return NextResponse.json({ error: 'Invalid replayedBy' }, { status: 400 });
    }
    if (body.force !== undefined && typeof body.force !== 'boolean') {
      return NextResponse.json({ error: 'Invalid force flag' }, { status: 400 });
    }

    const stripeEventId = typeof body.stripeEventId === 'string' ? body.stripeEventId.trim() : undefined;
    const replayedBy =
      typeof body.replayedBy === 'string'
        ? body.replayedBy.trim()
        : 'admin';

    const limit = Math.min(100, toPositiveInt(body.limit ?? 25) ?? 25);

    const rows = stripeEventId
      ? await db
          .select()
          .from(fastlaneWebhookEvents)
          .where(eq(fastlaneWebhookEvents.stripeEventId, stripeEventId))
          .limit(1)
      : await db
          .select()
          .from(fastlaneWebhookEvents)
          .where(and(eq(fastlaneWebhookEvents.processed, false), isNotNull(fastlaneWebhookEvents.error)))
          .orderBy(desc(fastlaneWebhookEvents.createdAt))
          .limit(limit);

    if (rows.length === 0) {
      return NextResponse.json({ reprocessed: 0, succeeded: 0, failed: 0, details: [] });
    }

    if (body.stripeEventId && rows[0]?.processed === true && body.force !== true) {
      return NextResponse.json(
        {
          error: 'Event already processed. Set force=true to replay anyway.',
          stripeEventId: rows[0].stripeEventId,
        },
        { status: 409 },
      );
    }

    const details: Array<{ stripeEventId: string; ok: boolean; error?: string }> = [];
    let succeeded = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        await processFastLaneStripeEvent(row.payload as StripeWebhookEvent);
        await db
          .update(fastlaneWebhookEvents)
          .set({
            processed: true,
            processedAt: new Date(),
            error: null,
            replayCount: (row.replayCount ?? 0) + 1,
            lastReplayAt: new Date(),
            lastReplayedBy: replayedBy,
          })
          .where(eq(fastlaneWebhookEvents.stripeEventId, row.stripeEventId));
        succeeded += 1;
        details.push({ stripeEventId: row.stripeEventId, ok: true });
      } catch (error) {
        const errorMessage = normalizeReplayErrorMessage(error);
        await db
          .update(fastlaneWebhookEvents)
          .set({
            processed: false,
            error: errorMessage,
            replayCount: (row.replayCount ?? 0) + 1,
            lastReplayAt: new Date(),
            lastReplayedBy: replayedBy,
          })
          .where(eq(fastlaneWebhookEvents.stripeEventId, row.stripeEventId));
        failed += 1;
        details.push({ stripeEventId: row.stripeEventId, ok: false, error: errorMessage });
      }
    }

    return NextResponse.json({
      reprocessed: rows.length,
      succeeded,
      failed,
      details,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to reprocess events' }, { status: 500 });
  }
}
