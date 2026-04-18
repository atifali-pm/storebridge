import { describe, it, expect, beforeEach } from "vitest";
import { shopLimiter, __resetLimitersForTests } from "@/lib/rate-limit";

describe("shopLimiter", () => {
  beforeEach(() => __resetLimitersForTests());

  it("serializes calls for the same shop", async () => {
    const order: number[] = [];
    const l = shopLimiter("acme.myshopify.com", { minIntervalMs: 30 });
    const p1 = l.run(async () => {
      await sleep(20);
      order.push(1);
    });
    const p2 = l.run(async () => order.push(2));
    const p3 = l.run(async () => order.push(3));
    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("enforces minInterval between sequential calls", async () => {
    const l = shopLimiter("throttled.myshopify.com", { minIntervalMs: 80 });
    const t0 = Date.now();
    await l.run(async () => undefined);
    await l.run(async () => undefined);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(70);
  });

  it("does not cross-contaminate different shops", async () => {
    const a = shopLimiter("a.myshopify.com", { minIntervalMs: 50 });
    const b = shopLimiter("b.myshopify.com", { minIntervalMs: 50 });
    expect(a).not.toBe(b);
    const t0 = Date.now();
    await Promise.all([a.run(async () => undefined), b.run(async () => undefined)]);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(50);
  });

  it("propagates errors from the wrapped fn", async () => {
    const l = shopLimiter("err.myshopify.com", { minIntervalMs: 10 });
    await expect(
      l.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
