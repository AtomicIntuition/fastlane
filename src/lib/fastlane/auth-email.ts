import { resolveFastLaneAppUrl } from './app-url';

type SendFastLaneLoginEmailInput = {
  toEmail: string;
  token: string;
  requestOrigin: string;
};

function hasNonPlaceholder(value: string | undefined | null): boolean {
  if (!value) return false;
  const normalized = value.trim();
  if (normalized.length === 0) return false;
  if (normalized.includes('...')) return false;
  return true;
}

export function isFastLaneAuthEmailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return hasNonPlaceholder(env.RESEND_API_KEY) && hasNonPlaceholder(env.FASTLANE_AUTH_EMAIL_FROM);
}

export async function sendFastLaneLoginEmail(input: SendFastLaneLoginEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.FASTLANE_AUTH_EMAIL_FROM?.trim();
  const replyTo = process.env.FASTLANE_AUTH_EMAIL_REPLY_TO?.trim();
  if (!apiKey || !from) {
    throw new Error('Auth email delivery is not configured');
  }

  const appUrl = resolveFastLaneAppUrl({
    headers: { get: (name: string) => (name.toLowerCase() === 'origin' ? input.requestOrigin : null) },
    nextUrl: new URL(input.requestOrigin),
  } as never);
  if (!appUrl) {
    throw new Error('Missing or invalid NEXT_PUBLIC_APP_URL');
  }

  const verifyUrl = `${appUrl}/fastlane/app?login_token=${encodeURIComponent(input.token)}`;
  const text = `Use this FastLane sign-in link (expires in 10 minutes): ${verifyUrl}`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.toEmail],
      subject: 'Your FastLane sign-in link',
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error('Email provider unavailable');
  }
}
