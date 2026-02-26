import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fastlaneSessions, fastlaneUsers } from '@/lib/db/schema';
import {
  ensureFastLaneUser,
  getFastLaneStateForUser,
  requireFastLaneUserId,
  unauthorized,
} from '@/lib/fastlane/server';
import { DEFAULT_STATE, getFastingProtocolById } from '@/lib/fastlane/types';
import { hasValidFastLaneCsrfRequest } from '@/lib/utils/fastlane-csrf';

const MAX_SESSION_DURATION_MINUTES = 7 * 24 * 60; // 7 days
const JSON_CONTENT_TYPE = 'application/json';
const MAX_SESSION_END_REQUEST_BYTES = 2_048; // 2 KB

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
      if (contentLength > MAX_SESSION_END_REQUEST_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
      }
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_SESSION_END_REQUEST_BYTES) {
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

    const userId = requireFastLaneUserId(request);
    if (!userId) return unauthorized();
    if (!hasValidFastLaneCsrfRequest(request, userId)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    }
    await ensureFastLaneUser(userId);

    const endedRows = await db
      .update(fastlaneUsers)
      .set({ activeFastStartAt: null, updatedAt: new Date() })
      .where(and(eq(fastlaneUsers.userId, userId), isNotNull(fastlaneUsers.activeFastStartAt)))
      .returning({
        protocolId: fastlaneUsers.protocolId,
        activeFastStartAt: fastlaneUsers.activeFastStartAt,
      });

    const ended = endedRows[0];
    if (!ended?.activeFastStartAt) {
      return NextResponse.json({ error: 'No active fast found' }, { status: 400 });
    }

    const endAt = new Date();
    const rawDurationMinutes = Math.max(
      0,
      Math.floor((endAt.getTime() - ended.activeFastStartAt.getTime()) / 60_000),
    );
    const durationCapped = rawDurationMinutes > MAX_SESSION_DURATION_MINUTES;
    const durationMinutes = Math.min(rawDurationMinutes, MAX_SESSION_DURATION_MINUTES);
    const protocolId = getFastingProtocolById(ended.protocolId)?.id ?? DEFAULT_STATE.profile.protocolId;

    await db.insert(fastlaneSessions).values({
      userId,
      protocolId,
      startAt: ended.activeFastStartAt,
      endAt,
      durationMinutes,
    });

    const state = await getFastLaneStateForUser(userId);
    return NextResponse.json({ state, durationMinutes, durationCapped });
  } catch {
    return NextResponse.json({ error: 'Unable to end fast' }, { status: 500 });
  }
}
