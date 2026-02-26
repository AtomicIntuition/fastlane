import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fastlaneSubscriptions } from '@/lib/db/schema';
import {
  ensureFastLaneUser,
  requireFastLaneUserId,
  unauthorized,
  upsertFastLaneSubscription,
} from '@/lib/fastlane/server';
import { resolveFastLaneAppUrl } from '@/lib/fastlane/app-url';
import { createCheckoutSession, createStripeCustomer } from '@/lib/fastlane/stripe';
import { getFastLaneStripePriceId, isFastLanePlan } from '@/lib/fastlane/pricing';

const JSON_CONTENT_TYPE = 'application/json';
const MAX_CHECKOUT_REQUEST_BYTES = 4_096; // 4 KB

function isRecoverableCustomerError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('no such customer') ||
    message.includes('customer not found') ||
    message.includes('resource_missing')
  );
}

export async function POST(request: NextRequest) {
  try {
    const unknownQueryKey = Array.from(request.nextUrl.searchParams.keys())[0];
    if (unknownQueryKey !== undefined) {
      return NextResponse.json({ error: `Unknown query parameter: ${unknownQueryKey}` }, { status: 400 });
    }

    const userId = requireFastLaneUserId(request);
    if (!userId) return unauthorized();

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
      if (contentLength > MAX_CHECKOUT_REQUEST_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
      }
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_CHECKOUT_REQUEST_BYTES) {
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
    const body = parsedBody as { plan?: unknown };
    const bodyKeys = Object.keys(body);
    for (const key of bodyKeys) {
      if (key !== 'plan') {
        return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 });
      }
    }

    if (!isFastLanePlan(body.plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const plan = body.plan;
    const priceId = getFastLaneStripePriceId(plan);

    if (!priceId) {
      return NextResponse.json(
        { error: `Missing Stripe price ID for ${plan} plan` },
        { status: 500 },
      );
    }

    const appUrl = resolveFastLaneAppUrl(request);
    if (!appUrl) {
      return NextResponse.json({ error: 'Missing or invalid NEXT_PUBLIC_APP_URL' }, { status: 500 });
    }
    const user = await ensureFastLaneUser(userId);

    const existingSub = await db
      .select()
      .from(fastlaneSubscriptions)
      .where(eq(fastlaneSubscriptions.userId, userId))
      .limit(1);

    const existingStatus = existingSub[0]?.status;
    const hadExistingCustomerId = !!existingSub[0]?.stripeCustomerId;
    let customerId = existingSub[0]?.stripeCustomerId ?? null;
    try {
      if (!customerId) {
        const customer = await createStripeCustomer(user.email, { userId, product: 'fastlane' });
        customerId = customer.id;
      }

      let checkout;
      try {
        checkout = await createCheckoutSession({
          customerId,
          priceId,
          successUrl: `${appUrl}/fastlane/app?billing=success`,
          cancelUrl: `${appUrl}/fastlane/app?billing=cancelled`,
          metadata: { userId, plan },
        });
      } catch (error) {
        if (!hadExistingCustomerId || !isRecoverableCustomerError(error)) {
          throw error;
        }
        // Recovery path for stale/invalid stored customer ids.
        const customer = await createStripeCustomer(user.email, { userId, product: 'fastlane' });
        customerId = customer.id;
        checkout = await createCheckoutSession({
          customerId,
          priceId,
          successUrl: `${appUrl}/fastlane/app?billing=success`,
          cancelUrl: `${appUrl}/fastlane/app?billing=cancelled`,
          metadata: { userId, plan },
        });
      }

      if (!checkout.url) {
        return NextResponse.json({ error: 'Billing provider unavailable' }, { status: 502 });
      }

      try {
        await upsertFastLaneSubscription({
          userId,
          stripeCustomerId: customerId,
          ...(existingStatus === 'active' || existingStatus === 'trialing'
            ? {}
            : { status: 'incomplete' }),
          plan,
        });
      } catch {
        // Non-fatal: checkout session is valid and webhook events can reconcile state.
      }

      return NextResponse.json({ checkoutUrl: checkout.url, sessionId: checkout.id });
    } catch {
      return NextResponse.json({ error: 'Billing provider unavailable' }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: 'Unable to initialize checkout' }, { status: 500 });
  }
}
