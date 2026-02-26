import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fastlaneWebhookEvents } from '@/lib/db/schema';
import { getStripeWebhookSecret, verifyStripeWebhookSignature } from '@/lib/fastlane/stripe';
import {
  processFastLaneStripeEvent,
  type StripeWebhookEvent,
} from '@/lib/fastlane/webhook-processor';

const MAX_WEBHOOK_PAYLOAD_BYTES = 1_000_000; // 1 MB
const STRIPE_WEBHOOK_CONTENT_TYPE = 'application/json';
const STRIPE_EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_]+$/;
const STRIPE_EVENT_TYPE_PATTERN = /^[A-Za-z0-9_.]+$/;
const MAX_STORED_WEBHOOK_ERROR_LENGTH = 1000;

function normalizeWebhookErrorMessage(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error)).trim();
  const safe = message.length > 0 ? message : 'Unknown processing error';
  return safe.slice(0, MAX_STORED_WEBHOOK_ERROR_LENGTH);
}

export async function POST(request: NextRequest) {
  const unknownQueryKey = Array.from(request.nextUrl.searchParams.keys())[0];
  if (unknownQueryKey !== undefined) {
    return NextResponse.json({ error: `Unknown query parameter: ${unknownQueryKey}` }, { status: 400 });
  }

  const rawSignatureHeader = request.headers.get('stripe-signature');
  const signatureHeader = rawSignatureHeader?.trim() ?? '';
  if (!signatureHeader) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }
  if (signatureHeader.length > 4096) {
    return NextResponse.json({ error: 'Invalid Stripe signature' }, { status: 400 });
  }

  const contentTypeHeader = request.headers.get('content-type')?.trim().toLowerCase() ?? '';
  const contentType = contentTypeHeader.split(';', 1)[0]?.trim() ?? '';
  if (contentType !== STRIPE_WEBHOOK_CONTENT_TYPE) {
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
    if (contentLength > MAX_WEBHOOK_PAYLOAD_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
  }

  const payload = await request.text();
  if (Buffer.byteLength(payload, 'utf8') > MAX_WEBHOOK_PAYLOAD_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }
  let secret: string;
  try {
    secret = getStripeWebhookSecret();
  } catch {
    return NextResponse.json({ error: 'Webhook signing secret not configured' }, { status: 500 });
  }

  if (!verifyStripeWebhookSignature(payload, signatureHeader, secret)) {
    return NextResponse.json({ error: 'Invalid Stripe signature' }, { status: 400 });
  }

  let event: StripeWebhookEvent;
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    event = parsed as StripeWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const eventId = typeof event.id === 'string' ? event.id.trim() : '';
  if (!eventId) {
    return NextResponse.json({ error: 'Missing Stripe event id' }, { status: 400 });
  }
  if (eventId.length > 100 || !STRIPE_EVENT_ID_PATTERN.test(eventId)) {
    return NextResponse.json({ error: 'Invalid Stripe event id' }, { status: 400 });
  }
  const eventType = typeof event.type === 'string' ? event.type.trim() : '';
  if (!eventType) {
    return NextResponse.json({ error: 'Missing Stripe event type' }, { status: 400 });
  }
  if (eventType.length > 100 || !STRIPE_EVENT_TYPE_PATTERN.test(eventType)) {
    return NextResponse.json({ error: 'Invalid Stripe event type' }, { status: 400 });
  }
  if (event.data !== undefined && (!event.data || typeof event.data !== 'object' || Array.isArray(event.data))) {
    return NextResponse.json({ error: 'Invalid Stripe event data' }, { status: 400 });
  }
  if (
    event.data &&
    event.data.object !== undefined &&
    (!event.data.object || typeof event.data.object !== 'object' || Array.isArray(event.data.object))
  ) {
    return NextResponse.json({ error: 'Invalid Stripe event object' }, { status: 400 });
  }
  const normalizedEvent: StripeWebhookEvent = { ...event, id: eventId, type: eventType };

  try {
    // Idempotency: process each Stripe event id at most once.
    const inserted = await db
      .insert(fastlaneWebhookEvents)
      .values({
        stripeEventId: eventId,
        eventType,
        payload: normalizedEvent as unknown as Record<string, unknown>,
        processed: false,
      })
      .onConflictDoNothing({ target: fastlaneWebhookEvents.stripeEventId })
      .returning({ id: fastlaneWebhookEvents.id });

    if (inserted.length === 0) {
      const existingRows = await db
        .select()
        .from(fastlaneWebhookEvents)
        .where(eq(fastlaneWebhookEvents.stripeEventId, eventId))
        .limit(1);
      const existing = existingRows[0];

      if (!existing || existing.processed) {
        return NextResponse.json({ received: true, duplicate: true });
      }

      try {
        await processFastLaneStripeEvent(normalizedEvent);

        await db
          .update(fastlaneWebhookEvents)
          .set({
            processed: true,
            processedAt: new Date(),
            error: null,
            replayCount: (existing.replayCount ?? 0) + 1,
            lastReplayAt: new Date(),
            lastReplayedBy: 'stripe-retry',
          })
          .where(eq(fastlaneWebhookEvents.stripeEventId, eventId));
      } catch (error) {
        const errorMessage = normalizeWebhookErrorMessage(error);
        await db
          .update(fastlaneWebhookEvents)
          .set({
            processed: false,
            error: errorMessage,
            replayCount: (existing.replayCount ?? 0) + 1,
            lastReplayAt: new Date(),
            lastReplayedBy: 'stripe-retry',
          })
          .where(eq(fastlaneWebhookEvents.stripeEventId, eventId));

        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
      }

      return NextResponse.json({ received: true, retried: true });
    }

    try {
      await processFastLaneStripeEvent(normalizedEvent);

      await db
        .update(fastlaneWebhookEvents)
        .set({ processed: true, processedAt: new Date(), error: null })
        .where(eq(fastlaneWebhookEvents.stripeEventId, eventId));
    } catch (error) {
      const errorMessage = normalizeWebhookErrorMessage(error);
      await db
        .update(fastlaneWebhookEvents)
        .set({
          processed: false,
          error: errorMessage,
        })
        .where(eq(fastlaneWebhookEvents.stripeEventId, eventId));

      // Return non-2xx so Stripe retries, but avoid bubbling an unhandled exception.
      return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: 'Webhook persistence failed' }, { status: 500 });
  }
}
