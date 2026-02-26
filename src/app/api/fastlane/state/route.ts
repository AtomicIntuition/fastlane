import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fastlaneUsers } from '@/lib/db/schema';
import {
  ensureFastLaneUser,
  getEffectiveFastLaneTier,
  getFastLaneStateForUser,
  requireFastLaneUserId,
  unauthorized,
} from '@/lib/fastlane/server';
import { hasValidFastLaneCsrfRequest } from '@/lib/utils/fastlane-csrf';
import { FASTING_PROTOCOLS, type FastingGoal, type ExperienceLevel } from '@/lib/fastlane/types';

const JSON_CONTENT_TYPE = 'application/json';
const MAX_STATE_REQUEST_BYTES = 8_192; // 8 KB
const STATE_VERSION_HEADER = 'x-fastlane-state-version';
const MAX_STATE_VERSION_LENGTH = 64;

function isValidGoal(value: unknown): value is FastingGoal {
  return value === 'weight' || value === 'energy' || value === 'metabolic' || value === 'routine';
}

function isValidExperience(value: unknown): value is ExperienceLevel {
  return value === 'new' || value === 'intermediate' || value === 'advanced';
}

function isValidTimeOfDay(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toStateVersion(value: Date | null | undefined): string | null {
  if (!(value instanceof Date)) return null;
  if (!Number.isFinite(value.getTime())) return null;
  return value.toISOString();
}

function isValidStateVersion(value: string): boolean {
  if (!value || value.length > MAX_STATE_VERSION_LENGTH) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return new Date(parsed).toISOString() === value;
}

export async function GET(request: NextRequest) {
  try {
    const userId = requireFastLaneUserId(request);
    if (!userId) return unauthorized();
    const unknownQueryKey = Array.from(request.nextUrl.searchParams.keys())[0];
    if (unknownQueryKey !== undefined) {
      return NextResponse.json({ error: `Unknown query parameter: ${unknownQueryKey}` }, { status: 400 });
    }

    const user = await ensureFastLaneUser(userId);
    const state = await getFastLaneStateForUser(userId);
    const stateVersion = toStateVersion(user.updatedAt);
    const response = NextResponse.json({ state, stateVersion });
    if (stateVersion) {
      response.headers.set(STATE_VERSION_HEADER, stateVersion);
    }
    return response;
  } catch {
    return NextResponse.json({ error: 'Unable to load state' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = requireFastLaneUserId(request);
    if (!userId) return unauthorized();
    if (!hasValidFastLaneCsrfRequest(request, userId)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    }
    const unknownQueryKey = Array.from(request.nextUrl.searchParams.keys())[0];
    if (unknownQueryKey !== undefined) {
      return NextResponse.json({ error: `Unknown query parameter: ${unknownQueryKey}` }, { status: 400 });
    }
    const user = await ensureFastLaneUser(userId);
    const tier = await getEffectiveFastLaneTier(userId, 'free').catch(() => 'free');
    const expectedStateVersion = request.headers.get(STATE_VERSION_HEADER);
    if (expectedStateVersion !== null) {
      const normalizedExpectedVersion = expectedStateVersion.trim();
      if (!isValidStateVersion(normalizedExpectedVersion)) {
        return NextResponse.json({ error: 'Invalid state version header' }, { status: 400 });
      }
      const currentStateVersion = toStateVersion(user.updatedAt);
      if (currentStateVersion && normalizedExpectedVersion !== currentStateVersion) {
        const state = await getFastLaneStateForUser(userId);
        const response = NextResponse.json(
          {
            error: 'State conflict. Refresh and retry.',
            state,
            stateVersion: currentStateVersion,
          },
          { status: 409 },
        );
        response.headers.set(STATE_VERSION_HEADER, currentStateVersion);
        return response;
      }
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
      if (contentLength > MAX_STATE_REQUEST_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
      }
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_STATE_REQUEST_BYTES) {
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
      goal?: unknown;
      experience?: unknown;
      protocolId?: unknown;
      wakeTime?: unknown;
      sleepTime?: unknown;
      reminders?: unknown;
      onboarded?: unknown;
    };

    const allowedKeys = new Set([
      'goal',
      'experience',
      'protocolId',
      'wakeTime',
      'sleepTime',
      'reminders',
      'onboarded',
    ]);
    const bodyKeys = Object.keys(body);
    if (bodyKeys.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }
    for (const key of bodyKeys) {
      if (!allowedKeys.has(key)) {
        return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 });
      }
    }

    const updates: Partial<typeof fastlaneUsers.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.goal !== undefined) {
      if (!isValidGoal(body.goal)) return NextResponse.json({ error: 'Invalid goal' }, { status: 400 });
      updates.goal = body.goal;
    }

    if (body.experience !== undefined) {
      if (!isValidExperience(body.experience)) {
        return NextResponse.json({ error: 'Invalid experience' }, { status: 400 });
      }
      updates.experience = body.experience;
    }

    if (body.protocolId !== undefined) {
      if (typeof body.protocolId !== 'string') {
        return NextResponse.json({ error: 'Invalid protocolId' }, { status: 400 });
      }

      const protocol = FASTING_PROTOCOLS.find((candidate) => candidate.id === body.protocolId);
      if (!protocol) {
        return NextResponse.json({ error: 'Invalid protocolId' }, { status: 400 });
      }

      if (protocol.premium && tier !== 'pro') {
        return NextResponse.json({ error: 'Upgrade required for premium protocol' }, { status: 403 });
      }

      updates.protocolId = body.protocolId;
    }

    if (body.wakeTime !== undefined) {
      if (!isValidTimeOfDay(body.wakeTime)) {
        return NextResponse.json({ error: 'Invalid wakeTime' }, { status: 400 });
      }
      updates.wakeTime = body.wakeTime;
    }

    if (body.sleepTime !== undefined) {
      if (!isValidTimeOfDay(body.sleepTime)) {
        return NextResponse.json({ error: 'Invalid sleepTime' }, { status: 400 });
      }
      updates.sleepTime = body.sleepTime;
    }

    if (body.reminders !== undefined) {
      if (typeof body.reminders !== 'boolean') {
        return NextResponse.json({ error: 'Invalid reminders value' }, { status: 400 });
      }
      updates.reminders = body.reminders;
    }

    if (body.onboarded !== undefined) {
      if (typeof body.onboarded !== 'boolean') {
        return NextResponse.json({ error: 'Invalid onboarded value' }, { status: 400 });
      }
      updates.onboarded = body.onboarded;
    }

    await db
      .update(fastlaneUsers)
      .set(updates)
      .where(eq(fastlaneUsers.userId, userId));

    const [state, latestUser] = await Promise.all([getFastLaneStateForUser(userId), ensureFastLaneUser(userId)]);
    const stateVersion = toStateVersion(latestUser.updatedAt);
    const response = NextResponse.json({ state, stateVersion });
    if (stateVersion) {
      response.headers.set(STATE_VERSION_HEADER, stateVersion);
    }
    return response;
  } catch {
    return NextResponse.json({ error: 'Unable to update state' }, { status: 500 });
  }
}
