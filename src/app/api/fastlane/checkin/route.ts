import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fastlaneCheckIns } from '@/lib/db/schema';
import {
  ensureFastLaneUser,
  getFastLaneStateForUser,
  requireFastLaneUserId,
  unauthorized,
} from '@/lib/fastlane/server';
import { hasValidFastLaneCsrfRequest } from '@/lib/utils/fastlane-csrf';

const JSON_CONTENT_TYPE = 'application/json';
const MAX_CHECKIN_REQUEST_BYTES = 4_096; // 4 KB

function clampFive(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  if (!Number.isInteger(value)) return null;
  if (value < 1 || value > 5) return null;
  return value;
}

export async function POST(request: NextRequest) {
  try {
    const unknownQueryKey = Array.from(request.nextUrl.searchParams.keys())[0];
    if (unknownQueryKey !== undefined) {
      return NextResponse.json({ error: `Unknown query parameter: ${unknownQueryKey}` }, { status: 400 });
    }

    const userId = requireFastLaneUserId(request);
    if (!userId) return unauthorized();
    if (!hasValidFastLaneCsrfRequest(request, userId)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    }
    await ensureFastLaneUser(userId);

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
      if (contentLength > MAX_CHECKIN_REQUEST_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
      }
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_CHECKIN_REQUEST_BYTES) {
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
    const body = parsedBody as { energy?: unknown; hunger?: unknown; mood?: unknown };
    const allowedKeys = new Set(['energy', 'hunger', 'mood']);
    const bodyKeys = Object.keys(body);
    if (bodyKeys.length === 0) {
      return NextResponse.json({ error: 'No check-in values provided' }, { status: 400 });
    }
    for (const key of bodyKeys) {
      if (!allowedKeys.has(key)) {
        return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 });
      }
    }

    const energy = clampFive(body.energy);
    const hunger = clampFive(body.hunger);
    const mood = clampFive(body.mood);

    if (energy === null || hunger === null || mood === null) {
      return NextResponse.json({ error: 'Energy, hunger, and mood must be 1-5' }, { status: 400 });
    }

    const now = new Date();
    const dayStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const nextDayStartUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);

    const existingToday = await db
      .select()
      .from(fastlaneCheckIns)
      .where(
        and(
          eq(fastlaneCheckIns.userId, userId),
          gte(fastlaneCheckIns.loggedAt, dayStartUtc),
          lt(fastlaneCheckIns.loggedAt, nextDayStartUtc),
        ),
      )
      .limit(1);

    if (existingToday[0]) {
      await db
        .update(fastlaneCheckIns)
        .set({ energy, hunger, mood, loggedAt: now })
        .where(eq(fastlaneCheckIns.id, existingToday[0].id));
    } else {
      await db.insert(fastlaneCheckIns).values({
        userId,
        energy,
        hunger,
        mood,
        loggedAt: now,
      });
    }

    const state = await getFastLaneStateForUser(userId);
    return NextResponse.json({ state });
  } catch {
    return NextResponse.json({ error: 'Unable to save check-in' }, { status: 500 });
  }
}
