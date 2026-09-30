import type Redis from 'ioredis';
import { hourWindowLabel, nextHourWindowStart } from '@ejs/shared';

/**
 * Atomic per-sender reservation: hourly quota + min-gap between sends.
 * Runs as a single Lua script so it is safe across any number of workers.
 * Returns [code, value]: 1 = reserved (value = count in window),
 * -1 = hourly quota exhausted, -2 = min-gap not elapsed (value = ms to wait).
 */
const RESERVE_LUA = `
local c = tonumber(redis.call('GET', KEYS[1]) or '0')
if c >= tonumber(ARGV[1]) then return {-1, 0} end
local delay = tonumber(ARGV[3])
if delay > 0 then
  local ttl = redis.call('PTTL', KEYS[2])
  if ttl > 0 then return {-2, ttl} end
end
c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
if delay > 0 then redis.call('SET', KEYS[2], '1', 'PX', delay) end
return {1, c}
`;

export type ReserveResult =
  | { ok: true; count: number }
  | { ok: false; reason: 'quota'; retryAt: number }
  | { ok: false; reason: 'gap'; retryAt: number };

export const quotaKey = (senderId: string, now: number) => `rl:${senderId}:${hourWindowLabel(now)}`;
export const gapKey = (senderId: string) => `gap:${senderId}`;

export async function reserveSend(
  redis: Redis,
  senderId: string,
  hourlyLimit: number,
  minDelayMs: number,
  now = Date.now(),
): Promise<ReserveResult> {
  const windowTtl = nextHourWindowStart(now) - now + 60_000;
  const [code, val] = (await redis.eval(
    RESERVE_LUA, 2, quotaKey(senderId, now), gapKey(senderId), hourlyLimit, windowTtl, minDelayMs,
  )) as [number, number];
  if (code === 1) return { ok: true, count: val };
  if (code === -2) return { ok: false, reason: 'gap', retryAt: now + val };
  return { ok: false, reason: 'quota', retryAt: nextHourWindowStart(now) };
}

export async function releaseSend(redis: Redis, senderId: string, now = Date.now()) {
  await redis.decr(quotaKey(senderId, now));
}

export async function currentUsage(redis: Redis, senderId: string, now = Date.now()): Promise<number> {
  return Number((await redis.get(quotaKey(senderId, now))) ?? 0);
}
