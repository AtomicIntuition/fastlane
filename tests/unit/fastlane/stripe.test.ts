import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { verifyStripeWebhookSignature } from '@/lib/fastlane/stripe';

describe('fastlane stripe signature verification', () => {
  it('accepts valid signature', () => {
    const payload = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed' });
    const secret = 'whsec_test_secret';
    const timestamp = '1700000000';
    const signedPayload = `${timestamp}.${payload}`;
    const digest = createHmac('sha256', secret).update(signedPayload).digest('hex');
    const header = `t=${timestamp},v1=${digest}`;

    expect(verifyStripeWebhookSignature(payload, header, secret, 1_700_000_000_000)).toBe(true);
  });

  it('rejects invalid signature', () => {
    const payload = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed' });
    const secret = 'whsec_test_secret';
    const header = 't=1700000000,v1=deadbeef';

    expect(verifyStripeWebhookSignature(payload, header, secret, 1_700_000_000_000)).toBe(false);
  });

  it('rejects stale timestamps outside tolerance window', () => {
    const payload = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed' });
    const secret = 'whsec_test_secret';
    const timestamp = '1700000000';
    const signedPayload = `${timestamp}.${payload}`;
    const digest = createHmac('sha256', secret).update(signedPayload).digest('hex');
    const header = `t=${timestamp},v1=${digest}`;

    expect(verifyStripeWebhookSignature(payload, header, secret, 1_700_001_000_000)).toBe(false);
  });

  it('rejects non-numeric timestamp values', () => {
    const payload = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed' });
    const secret = 'whsec_test_secret';
    const header = 't=not-a-number,v1=deadbeef';

    expect(verifyStripeWebhookSignature(payload, header, secret, 1_700_000_000_000)).toBe(false);
  });

  it('rejects non-integer timestamp values', () => {
    const payload = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed' });
    const secret = 'whsec_test_secret';
    const header = 't=1700000000.5,v1=deadbeef';

    expect(verifyStripeWebhookSignature(payload, header, secret, 1_700_000_000_000)).toBe(false);
  });

  it('rejects malformed v1 signatures even if timestamp is valid', () => {
    const payload = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed' });
    const secret = 'whsec_test_secret';
    const timestamp = '1700000000';

    expect(
      verifyStripeWebhookSignature(payload, `t=${timestamp},v1=nothex`, secret, 1_700_000_000_000),
    ).toBe(false);
    expect(
      verifyStripeWebhookSignature(payload, `t=${timestamp},v1=abcd`, secret, 1_700_000_000_000),
    ).toBe(false);
  });
});
