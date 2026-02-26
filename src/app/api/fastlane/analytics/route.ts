import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fastlaneAnalyticsEvents } from '@/lib/db/schema';
import { getUserIdFromRequest } from '@/lib/utils/signed-cookie';

const JSON_CONTENT_TYPE = 'application/json';
const MAX_ANALYTICS_REQUEST_BYTES = 4096;
const MAX_PROPS_KEYS = 20;
const MAX_PROP_KEY_LENGTH = 40;
const MAX_PROP_STRING_LENGTH = 200;
const MAX_EVENT_AGE_MS = 1000 * 60 * 60 * 24 * 180; // 180 days

const ALLOWED_EVENTS = new Set([
  'landing_cta_clicked',
  'signup_started',
  'onboarding_completed',
  'first_fast_started',
  'first_fast_completed',
  'paywall_viewed',
  'trial_started',
  'subscription_started',
  'subscription_canceled',
  'weekly_active_user',
]);

type AnalyticsEventName =
  | 'landing_cta_clicked'
  | 'signup_started'
  | 'onboarding_completed'
  | 'first_fast_started'
  | 'first_fast_completed'
  | 'paywall_viewed'
  | 'trial_started'
  | 'subscription_started'
  | 'subscription_canceled'
  | 'weekly_active_user';

function isSafePropValue(value: unknown): value is string | number | boolean | null {
  if (value === null) return true;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= MAX_PROP_STRING_LENGTH;
  return false;
}

function normalizeProps(value: unknown): Record<string, string | number | boolean | null> | null {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return null;

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_PROPS_KEYS) return null;

  const normalized: Record<string, string | number | boolean | null> = {};
  for (const [key, propValue] of entries) {
    if (!/^[a-zA-Z0-9_]+$/.test(key)) return null;
    if (key.length === 0 || key.length > MAX_PROP_KEY_LENGTH) return null;
    if (!isSafePropValue(propValue)) return null;
    normalized[key] = propValue;
  }

  return normalized;
}

function normalizeEventAt(value: unknown): Date | null {
  if (value === undefined || value === null) return new Date();
  if (typeof value !== 'string' || value.length > 64) return null;

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;

  const nowMs = Date.now();
  const eventMs = parsed.getTime();
  if (eventMs > nowMs + 1000 * 60 * 5) return null; // small future skew only
  if (eventMs < nowMs - MAX_EVENT_AGE_MS) return null;

  return parsed;
}

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
      if (contentLength > MAX_ANALYTICS_REQUEST_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
      }
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_ANALYTICS_REQUEST_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
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

    const body = parsedBody as {
      name?: unknown;
      at?: unknown;
      props?: unknown;
    };

    const allowedKeys = new Set(['name', 'at', 'props']);
    for (const key of Object.keys(body)) {
      if (!allowedKeys.has(key)) {
        return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 });
      }
    }

    if (typeof body.name !== 'string' || !ALLOWED_EVENTS.has(body.name)) {
      return NextResponse.json({ error: 'Invalid event name' }, { status: 400 });
    }

    const eventAt = normalizeEventAt(body.at);
    if (!eventAt) {
      return NextResponse.json({ error: 'Invalid event timestamp' }, { status: 400 });
    }

    const props = normalizeProps(body.props);
    if (body.props !== undefined && props === null) {
      return NextResponse.json({ error: 'Invalid event props' }, { status: 400 });
    }

    const userId = getUserIdFromRequest(request);

    await db.insert(fastlaneAnalyticsEvents).values({
      userId: userId ?? null,
      eventName: body.name as AnalyticsEventName,
      source: 'web',
      eventAt,
      props,
    });

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch {
    return NextResponse.json({ error: 'Unable to ingest analytics event' }, { status: 500 });
  }
}
