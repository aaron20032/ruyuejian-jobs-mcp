/**
 * In-memory sliding-window rate limiter keyed by an arbitrary string (e.g. client IP).
 *
 * This is the server-side counterpart to the per-process upstream budget in api.ts.
 * In stdio mode each user runs their own process, so api.ts's local bucket is naturally
 * per-user. On a shared public HTTP endpoint that local bucket no longer isolates clients,
 * so the HTTP edge enforces a per-key window here before any tool work happens.
 *
 * Single-instance only: state lives in this process. Behind multiple replicas put a shared
 * limiter (Redis) at the proxy, or accept per-replica windows. Kept dependency-free on purpose.
 */
export interface RateLimiterOptions {
  /** Maximum number of hits allowed per key inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Injectable clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Hits still available in the current window when allowed, else 0. */
  remaining: number;
  /** Milliseconds until the oldest hit expires; 0 when allowed. */
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
  /** Number of tracked keys (for tests / diagnostics). */
  size(): number;
  reset(): void;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { limit, windowMs } = options;
  if (!Number.isFinite(limit) || limit <= 0) throw new Error('rate limiter limit must be a positive number');
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error('rate limiter windowMs must be a positive number');
  const now = options.now ?? Date.now;
  const hits = new Map<string, number[]>();
  let checksSinceSweep = 0;

  function sweep(cutoff: number) {
    for (const [key, times] of hits) {
      const fresh = times.filter((t) => t > cutoff);
      if (fresh.length) hits.set(key, fresh);
      else hits.delete(key);
    }
  }

  return {
    check(key: string): RateLimitResult {
      const t = now();
      const cutoff = t - windowMs;
      const recent = (hits.get(key) ?? []).filter((time) => time > cutoff);
      if (recent.length >= limit) {
        hits.set(key, recent);
        const retryAfterMs = Math.max(0, recent[0] + windowMs - t);
        return { allowed: false, remaining: 0, retryAfterMs };
      }
      recent.push(t);
      hits.set(key, recent);
      // Amortized cleanup so abandoned keys do not accumulate forever.
      if (++checksSinceSweep >= 1024) {
        checksSinceSweep = 0;
        sweep(cutoff);
      }
      return { allowed: true, remaining: limit - recent.length, retryAfterMs: 0 };
    },
    size: () => hits.size,
    reset: () => hits.clear(),
  };
}