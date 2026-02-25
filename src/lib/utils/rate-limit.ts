/**
 * Edge-compatible in-memory rate limiter using a sliding window approach.
 * Uses only standard Web APIs (no Node.js-specific modules).
 *
 * Note: In-memory state is per-isolate on Vercel Edge, so limits are
 * approximate in a multi-region deployment. For an MVP this is acceptable;
 * upgrade to a Redis-backed store (e.g. @upstash/ratelimit) for strict
 * enforcement.
 */

interface RateLimitOptions {
  /** Time window in milliseconds */
  interval: number;
  /** Maximum number of requests allowed per window */
  limit: number;
}

interface RateLimitEntry {
  /** Timestamps of requests within the current window */
  timestamps: number[];
}

interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of remaining requests in the current window */
  remaining: number;
  /** Unix timestamp (ms) when the window resets */
  resetAt: number;
}

/**
 * Creates a rate limiter instance with the given options.
 *
 * Returns an async check function that accepts an identifier (typically an IP)
 * and returns whether the request is allowed along with metadata.
 */
export function rateLimit({ interval, limit }: RateLimitOptions) {
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup of expired entries to prevent memory leaks.
  // Runs every `interval` ms and removes entries whose most recent
  // request is older than the window.
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  function ensureCleanup() {
    if (cleanupTimer !== null) return;
    cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of store) {
        // Remove entries where all timestamps have expired
        if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < now - interval) {
          store.delete(key);
        }
      }
      // If the store is empty, stop the cleanup timer
      if (store.size === 0 && cleanupTimer !== null) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }
    }, interval);

    // In Edge runtimes, setInterval returns a number.
    // Ensure the timer does not prevent the isolate from shutting down.
    if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
      (cleanupTimer as NodeJS.Timeout).unref();
    }
  }

  return async function check(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - interval;

    let entry = store.get(identifier);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(identifier, entry);
    }

    // Discard timestamps outside the sliding window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    if (entry.timestamps.length >= limit) {
      // Rate limit exceeded
      const oldestInWindow = entry.timestamps[0];
      return {
        allowed: false,
        remaining: 0,
        resetAt: oldestInWindow + interval,
      };
    }

    // Record this request
    entry.timestamps.push(now);

    ensureCleanup();

    return {
      allowed: true,
      remaining: limit - entry.timestamps.length,
      resetAt: entry.timestamps[0] + interval,
    };
  };
}
