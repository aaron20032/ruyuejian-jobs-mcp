import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../src/rateLimit.js';

describe('createRateLimiter', () => {
  it('allows up to the limit then rejects within the window', () => {
    let clock = 1_000;
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => clock });
    expect(limiter.check('ip').allowed).toBe(true);
    expect(limiter.check('ip').allowed).toBe(true);
    const third = limiter.check('ip');
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    const fourth = limiter.check('ip');
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterMs).toBe(60_000);
  });

  it('isolates keys from each other', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
    expect(limiter.check('b').allowed).toBe(true);
  });

  it('frees capacity as hits age out of the window', () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000, now: () => clock });
    limiter.check('ip');
    clock = 500;
    limiter.check('ip');
    expect(limiter.check('ip').allowed).toBe(false);
    clock = 1_001; // first hit (t=0) expired, second (t=500) still inside
    const result = limiter.check('ip');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('reports retryAfter from the oldest in-window hit', () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 10_000, now: () => clock });
    limiter.check('ip');
    clock = 4_000;
    expect(limiter.check('ip').retryAfterMs).toBe(6_000);
  });

  it('rejects invalid configuration', () => {
    expect(() => createRateLimiter({ limit: 0, windowMs: 1000 })).toThrow();
    expect(() => createRateLimiter({ limit: 5, windowMs: 0 })).toThrow();
  });
});