import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import IORedis from 'ioredis';
import { reserveSend } from './rate-limiter';

const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
const r = new IORedis(url, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
let up = false;
beforeAll(async () => {
  try {
    await r.connect();
    await r.ping();
    up = true;
  } catch {
    up = false;
  }
});
afterAll(() => r.disconnect());

describe('reserveSend (needs Redis)', () => {
  it('enforces hourly quota atomically under concurrency', async (ctx) => {
    if (!up) return ctx.skip();
    const id = 'test-' + Date.now();
    const results = await Promise.all(Array.from({ length: 50 }, () => reserveSend(r, id, 10, 0)));
    expect(results.filter((x) => x.ok).length).toBe(10);
    const denied = results.find((x) => !x.ok)!;
    expect(denied.ok === false && denied.reason).toBe('quota');
  });
  it('enforces min gap between sends', async (ctx) => {
    if (!up) return ctx.skip();
    const id = 'gap-' + Date.now();
    expect((await reserveSend(r, id, 100, 5000)).ok).toBe(true);
    const second = await reserveSend(r, id, 100, 5000);
    expect(second.ok === false && second.reason).toBe('gap');
  });
});
