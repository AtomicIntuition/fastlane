import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fastlaneUsers } from '@/lib/db/schema';
import {
  ensureFastLaneUser,
  getEffectiveFastLaneTier,
  getFastLaneStateForUser,
  requireFastLaneUserId,
  unauthorized,
} from '@/lib/fastlane/server';
import { getFastingProtocolById } from '@/lib/fastlane/types';
import { hasValidFastLaneCsrfRequest } from '@/lib/utils/fastlane-csrf';

const JSON_CONTENT_TYPE = 'application/json';
const MAX_SESSION_START_REQUEST_BYTES = 2_048; // 2 KB

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
      if (contentLength > MAX_SESSION_START_REQUEST_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
      }
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_SESSION_START_REQUEST_BYTES) {
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
    const user = await ensureFastLaneUser(userId);
    const tier = await getEffectiveFastLaneTier(userId, 'free').catch(() => 'free');

    const protocol = getFastingProtocolById(user.protocolId);
    if (!protocol) {
      return NextResponse.json({ error: 'Invalid stored protocol. Update your fasting plan.' }, { status: 400 });
    }

    if (protocol.premium && tier !== 'pro') {
      return NextResponse.json({ error: 'Upgrade required for premium protocol' }, { status: 403 });
    }

    const started = await db
      .update(fastlaneUsers)
      .set({ activeFastStartAt: new Date(), updatedAt: new Date() })
      .where(and(eq(fastlaneUsers.userId, userId), isNull(fastlaneUsers.activeFastStartAt)))
      .returning({ id: fastlaneUsers.id });

    if (started.length === 0) {
      const userRows = await db.select().from(fastlaneUsers).where(eq(fastlaneUsers.userId, userId)).limit(1);
      const user = userRows[0];
      if (user?.activeFastStartAt) {
        return NextResponse.json(
          { error: 'Fast already active', activeFastStartAt: user.activeFastStartAt.toISOString() },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: 'Unable to start fast' }, { status: 500 });
    }

    const state = await getFastLaneStateForUser(userId);
    return NextResponse.json({ state });
  } catch {
    return NextResponse.json({ error: 'Unable to start fast' }, { status: 500 });
  }
}
