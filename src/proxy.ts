import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/utils/rate-limit';

/**
 * Per-route rate limiters.
 *
 * These live in module scope so they persist across requests within the same
 * Edge isolate. On Vercel, each region gets its own isolate, so limits are
 * per-region — acceptable for an MVP without Redis.
 */
const fastlaneLimiter = rateLimit({ interval: 60_000, limit: 60 }); // 60 req/min
const fastlaneAuthSessionRequestLimiter = rateLimit({ interval: 60_000, limit: 8 }); // 8 req/min
const fastlaneAuthSessionVerifyLimiter = rateLimit({ interval: 60_000, limit: 20 }); // 20 req/min
const fastlaneMaintenanceLimiter = rateLimit({ interval: 60_000, limit: 6 }); // 6 req/min
const fastlaneThrottleMaintenanceLimiter = rateLimit({ interval: 60_000, limit: 4 }); // 4 req/min
const fastlaneMaintenanceRunLimiter = rateLimit({ interval: 60_000, limit: 2 }); // 2 req/min
const adminAuthLimiter = rateLimit({ interval: 60_000, limit: 10 }); // 10 req/min
const adminMaintenanceLimiter = rateLimit({ interval: 60_000, limit: 12 }); // 12 req/min
const adminThrottleMaintenanceLimiter = rateLimit({ interval: 60_000, limit: 8 }); // 8 req/min
const adminMaintenanceRunLimiter = rateLimit({ interval: 60_000, limit: 6 }); // 6 req/min
const adminFastlaneLimiter = rateLimit({ interval: 60_000, limit: 30 }); // 30 req/min

/**
 * Map of pathname prefixes to their rate limiter.
 * FastLane API limits only.
 */
const routeLimiters: { path: string; limiter: ReturnType<typeof rateLimit> }[] = [
  { path: '/api/fastlane/auth/session/request', limiter: fastlaneAuthSessionRequestLimiter },
  { path: '/api/fastlane/auth/session/verify', limiter: fastlaneAuthSessionVerifyLimiter },
  { path: '/api/fastlane/maintenance/run', limiter: fastlaneMaintenanceRunLimiter },
  { path: '/api/fastlane/maintenance/auth-request-throttle', limiter: fastlaneThrottleMaintenanceLimiter },
  { path: '/api/fastlane/maintenance/auth-replay', limiter: fastlaneMaintenanceLimiter },
  { path: '/api/fastlane', limiter: fastlaneLimiter },
  { path: '/api/admin/fastlane/auth', limiter: adminAuthLimiter },
  { path: '/api/admin/fastlane/maintenance/run', limiter: adminMaintenanceRunLimiter },
  { path: '/api/admin/fastlane/maintenance/auth-request-throttle', limiter: adminThrottleMaintenanceLimiter },
  { path: '/api/admin/fastlane/maintenance/auth-replay', limiter: adminMaintenanceLimiter },
  { path: '/api/admin/fastlane', limiter: adminFastlaneLimiter },
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

export async function proxy(request: NextRequest) {
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
 * Only run proxy on the API routes we want to rate-limit.
 * This avoids invoking the edge proxy on every page/asset request.
 */
export const config = {
  matcher: [
    '/api/fastlane/:path*',
    '/api/admin/fastlane/auth',
    '/api/admin/fastlane/:path*',
  ],
};
