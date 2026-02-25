import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/utils/rate-limit';

/**
 * Per-route rate limiters.
 *
 * These live in module scope so they persist across requests within the same
 * Edge isolate. On Vercel, each region gets its own isolate, so limits are
 * per-region — acceptable for an MVP without Redis.
 */
const predictLimiter = rateLimit({ interval: 60_000, limit: 5 });   // 5 req/min
const userLimiter = rateLimit({ interval: 60_000, limit: 10 });     // 10 req/min

/**
 * Map of pathname prefixes to their rate limiter.
 * `/api/simulate` is intentionally excluded — it is already auth-gated
 * via CRON_SECRET in the route handler.
 */
const routeLimiters: { path: string; limiter: ReturnType<typeof rateLimit> }[] = [
  { path: '/api/predict', limiter: predictLimiter },
  { path: '/api/user', limiter: userLimiter },
];

function getClientIp(request: NextRequest): string {
  // Vercel sets x-forwarded-for; fall back to x-real-ip, then a default.
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list; the first entry is the client.
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') ?? '127.0.0.1';
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  for (const { path, limiter } of routeLimiters) {
    if (pathname.startsWith(path)) {
      const ip = getClientIp(request);
      const result = await limiter(ip);

      if (!result.allowed) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
            },
          },
        );
      }

      // Attach rate limit headers to the successful response
      const response = NextResponse.next();
      response.headers.set('X-RateLimit-Remaining', String(result.remaining));
      response.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
      return response;
    }
  }

  return NextResponse.next();
}

/**
 * Only run middleware on the API routes we want to rate-limit.
 * This avoids invoking middleware on every page/asset request.
 */
export const config = {
  matcher: ['/api/predict/:path*', '/api/user/:path*'],
};
