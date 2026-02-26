import { createHmac, timingSafeEqual } from 'crypto';

export type StripeSubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300; // 5 minutes
const STRIPE_V1_SIGNATURE_HEX_LENGTH = 64; // sha256 digest hex length

function getStripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY missing');
  return key;
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET missing');
  return secret;
}

async function stripePost<T>(path: string, params: URLSearchParams): Promise<T> {
  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Stripe API error (${res.status})`);
  }
  return data as T;
}

export async function createStripeCustomer(email: string | null | undefined, metadata: Record<string, string>) {
  const params = new URLSearchParams();
  if (email) params.set('email', email);
  for (const [key, value] of Object.entries(metadata)) {
    params.set(`metadata[${key}]`, value);
  }

  return stripePost<{ id: string }>('/customers', params);
}

export async function createCheckoutSession(input: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}) {
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('customer', input.customerId);
  params.set('line_items[0][price]', input.priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', input.successUrl);
  params.set('cancel_url', input.cancelUrl);
  params.set('allow_promotion_codes', 'true');

  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    params.set(`metadata[${key}]`, value);
  }

  return stripePost<{ id: string; url: string | null }>('/checkout/sessions', params);
}

export async function createBillingPortalSession(customerId: string, returnUrl: string) {
  const params = new URLSearchParams();
  params.set('customer', customerId);
  params.set('return_url', returnUrl);

  return stripePost<{ url: string }>('/billing_portal/sessions', params);
}

export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  nowMs = Date.now(),
): boolean {
  const elements = signatureHeader.split(',').map((part) => part.trim());
  const timestampPart = elements.find((part) => part.startsWith('t='));
  const signatureParts = elements.filter((part) => part.startsWith('v1='));

  if (!timestampPart || signatureParts.length === 0) return false;

  const timestamp = timestampPart.replace('t=', '');
  if (!/^\d+$/.test(timestamp)) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) return false;

  const nowSeconds = Math.floor(nowMs / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > STRIPE_WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');

  for (const part of signatureParts) {
    const provided = part.replace('v1=', '');
    if (!/^[a-fA-F0-9]+$/.test(provided)) continue;
    if (provided.length !== STRIPE_V1_SIGNATURE_HEX_LENGTH) continue;
    const a = Buffer.from(provided, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return true;
    }
  }

  return false;
}
