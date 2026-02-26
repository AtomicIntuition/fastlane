import type { NextRequest } from 'next/server';

function normalize(url: string): string {
  return url.replace(/\/+$/, '');
}

function isAllowedAppUrl(url: URL): boolean {
  const protocol = url.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  return true;
}

export function resolveFastLaneAppUrl(request: NextRequest): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      // Validate configured URL format once before using it in Stripe redirects.
      const parsed = new URL(configured);
      if (!isAllowedAppUrl(parsed)) {
        return null;
      }
      return normalize(configured);
    } catch {
      return null;
    }
  }

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  try {
    const parsedOrigin = new URL(request.nextUrl.origin);
    if (!isAllowedAppUrl(parsedOrigin)) {
      return null;
    }
    return normalize(parsedOrigin.toString());
  } catch {
    return null;
  }
}
