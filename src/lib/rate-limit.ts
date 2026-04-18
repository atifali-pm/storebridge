/**
 * Per-shop serial rate limiter for outbound Shopify API calls.
 *
 * Shopify Admin API: ~40 requests/sec burst per shop (leaky-bucket).
 * We target ~20 req/sec (50ms between calls) to leave headroom for
 * retries and concurrent flows.
 *
 * In-memory only: sufficient for a single worker/web instance demo.
 * For multi-instance production, swap for a Redis-backed limiter.
 */

export interface RateLimiterOptions {
  /** Minimum interval between sequential calls in milliseconds. */
  minIntervalMs: number;
}

class ShopLimiter {
  private lastRun = 0;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly opts: RateLimiterOptions) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const prior = this.tail;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    this.tail = gate;

    try {
      await prior;
      const wait = Math.max(0, this.lastRun + this.opts.minIntervalMs - Date.now());
      if (wait > 0) await sleep(wait);
      const value = await fn();
      this.lastRun = Date.now();
      return value;
    } finally {
      release();
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const limiters = new Map<string, ShopLimiter>();
const DEFAULT_OPTS: RateLimiterOptions = { minIntervalMs: 50 };

export function shopLimiter(shop: string, opts: RateLimiterOptions = DEFAULT_OPTS): ShopLimiter {
  let limiter = limiters.get(shop);
  if (!limiter) {
    limiter = new ShopLimiter(opts);
    limiters.set(shop, limiter);
  }
  return limiter;
}

/** Test helper: drop all limiter state. */
export function __resetLimitersForTests(): void {
  limiters.clear();
}
