import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isFastLaneAuthEmailConfigured, sendFastLaneLoginEmail } from '@/lib/fastlane/auth-email';

describe('fastlane auth email', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialResendApiKey = env.RESEND_API_KEY;
  const initialFrom = env.FASTLANE_AUTH_EMAIL_FROM;
  const initialReplyTo = env.FASTLANE_AUTH_EMAIL_REPLY_TO;
  const initialAppUrl = env.NEXT_PUBLIC_APP_URL;
  const initialNodeEnv = env.NODE_ENV;
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_123';
    process.env.FASTLANE_AUTH_EMAIL_FROM = 'FastLane <no-reply@fastlane.app>';
    process.env.FASTLANE_AUTH_EMAIL_REPLY_TO = 'support@fastlane.app';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    env.NODE_ENV = 'test';
    fetchSpy.mockResolvedValue({ ok: true } as Response);
  });

  afterEach(() => {
    env.RESEND_API_KEY = initialResendApiKey;
    env.FASTLANE_AUTH_EMAIL_FROM = initialFrom;
    env.FASTLANE_AUTH_EMAIL_REPLY_TO = initialReplyTo;
    env.NEXT_PUBLIC_APP_URL = initialAppUrl;
    env.NODE_ENV = initialNodeEnv;
    fetchSpy.mockReset();
  });

  it('reports configuration readiness', () => {
    expect(isFastLaneAuthEmailConfigured()).toBe(true);
    delete process.env.RESEND_API_KEY;
    expect(isFastLaneAuthEmailConfigured()).toBe(false);
  });

  it('sends email payload to resend when configured', async () => {
    await sendFastLaneLoginEmail({
      toEmail: 'user@example.com',
      token: 'token-123',
      requestOrigin: 'http://localhost:3000',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
