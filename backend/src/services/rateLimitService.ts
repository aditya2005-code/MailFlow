import { getRedisClient } from '../config/redis.js';
import { env } from '../config/env.js';

export interface RateLimitOptions {
  maxEmailsPerHour?: number;
  minEmailDelayMs?: number;
  keyPrefix?: string;
}

export interface AcquireSlotResult {
  allowed: boolean;
  reason: 'slot_acquired' | 'hourly_limit_reached' | 'min_delay_required';
  delayMs: number;
  currentHourlyCount: number;
  nextAvailableTimeMs?: number;
}

/**
 * Redis Lua Script for Atomic Rate-Limit & Inter-Email Delay Reservation.
 *
 * Atomically checks hourly capacity and minimum send delay in a single Redis execution,
 * preventing race conditions across concurrent workers/processes.
 */
const ACQUIRE_SLOT_LUA = `
local hourly_key = KEYS[1]
local last_send_key = KEYS[2]

local max_allowed = tonumber(ARGV[1])
local min_delay = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local window_ttl = tonumber(ARGV[4])
local reset_delay = tonumber(ARGV[5])

-- 1. Check Hourly Limit
local hourly_count = tonumber(redis.call('GET', hourly_key) or '0')
if hourly_count >= max_allowed then
    return {0, "hourly_limit_reached", reset_delay, hourly_count}
end

-- 2. Check Minimum Inter-Email Delay
local last_send = tonumber(redis.call('GET', last_send_key) or '0')
local earliest_allowed = 0
if last_send > 0 then
    earliest_allowed = last_send + min_delay
end

if now < earliest_allowed then
    local delay_needed = earliest_allowed - now
    return {0, "min_delay_required", delay_needed, hourly_count}
end

-- 3. Acquire Slot: Increment Hourly Count & Update Last Send Time
local new_count = redis.call('INCR', hourly_key)
if new_count == 1 then
    redis.call('EXPIRE', hourly_key, window_ttl)
end

redis.call('SET', last_send_key, tostring(now))
redis.call('EXPIRE', last_send_key, 86400) -- 24 hours TTL

return {1, "slot_acquired", 0, new_count}
`;

export const rateLimitService = {
  /**
   * Generates a deterministic hourly window string (YYYYMMDDHH in UTC).
   */
  getHourlyWindowString(date: Date = new Date()): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    return `${year}${month}${day}${hour}`;
  },

  /**
   * Calculates milliseconds remaining until the start of the next UTC hour (+1000ms buffer).
   */
  getMsUntilNextHourWindow(date: Date = new Date()): number {
    const nextHour = new Date(date);
    nextHour.setUTCHours(nextHour.getUTCHours() + 1, 0, 0, 0);
    return Math.max(1000, nextHour.getTime() - date.getTime() + 1000);
  },

  /**
   * Atomically acquires a rate limit send slot via Redis.
   *
   * Checks both MAX_EMAILS_PER_HOUR and MIN_EMAIL_DELAY_MS.
   * If capacity is unavailable or minimum delay is not met, returns `allowed: false`
   * with the exact `delayMs` required for job rescheduling.
   */
  async acquireSendSlot(options: RateLimitOptions = {}): Promise<AcquireSlotResult> {
    const maxAllowed = options.maxEmailsPerHour ?? env.MAX_EMAILS_PER_HOUR;
    const minDelayMs = options.minEmailDelayMs ?? env.MIN_EMAIL_DELAY_MS;
    const prefix = options.keyPrefix ? `:${options.keyPrefix}` : '';

    const now = Date.now();
    const windowStr = this.getHourlyWindowString(new Date(now));
    const resetDelay = this.getMsUntilNextHourWindow(new Date(now));
    const windowTtl = Math.ceil(resetDelay / 1000) + 3600; // 1 hour + reset buffer

    const hourlyKey = `mailflow:rate-limit${prefix}:global:hourly:${windowStr}`;
    const lastSendKey = `mailflow:rate-limit${prefix}:global:last-send-time`;

    const redis = getRedisClient();

    const [allowedNum, reason, delayMs, count] = (await redis.eval(
      ACQUIRE_SLOT_LUA,
      2,
      hourlyKey,
      lastSendKey,
      maxAllowed,
      minDelayMs,
      now,
      windowTtl,
      resetDelay,
    )) as [number, string, number, number];

    const isAllowed = allowedNum === 1;

    if (!isAllowed) {
      console.log(
        `[rate-limiter] ⛔ Send slot denied (${reason}). Delay needed: ${delayMs}ms, Current hourly count: ${count}/${maxAllowed}`,
      );
    } else {
      console.log(
        `[rate-limiter] 🟢 Send slot acquired. Current hourly count: ${count}/${maxAllowed}`,
      );
    }

    return {
      allowed: isAllowed,
      reason: reason as any,
      delayMs,
      currentHourlyCount: count,
      nextAvailableTimeMs: now + delayMs,
    };
  },

  /**
   * Helper to retrieve current hourly send count.
   */
  async getHourlyCount(options: RateLimitOptions = {}): Promise<number> {
    const prefix = options.keyPrefix ? `:${options.keyPrefix}` : '';
    const windowStr = this.getHourlyWindowString();
    const hourlyKey = `mailflow:rate-limit${prefix}:global:hourly:${windowStr}`;

    const redis = getRedisClient();
    const countStr = await redis.get(hourlyKey);
    return countStr ? parseInt(countStr, 10) : 0;
  },

  /**
   * Helper to retrieve last send timestamp.
   */
  async getLastSendTime(options: RateLimitOptions = {}): Promise<number> {
    const prefix = options.keyPrefix ? `:${options.keyPrefix}` : '';
    const lastSendKey = `mailflow:rate-limit${prefix}:global:last-send-time`;

    const redis = getRedisClient();
    const timeStr = await redis.get(lastSendKey);
    return timeStr ? parseInt(timeStr, 10) : 0;
  },

  /**
   * Helper to reset rate limiter keys (for testing).
   */
  async resetLimits(options: RateLimitOptions = {}): Promise<void> {
    const prefix = options.keyPrefix ? `:${options.keyPrefix}` : '';
    const windowStr = this.getHourlyWindowString();
    const hourlyKey = `mailflow:rate-limit${prefix}:global:hourly:${windowStr}`;
    const lastSendKey = `mailflow:rate-limit${prefix}:global:last-send-time`;

    const redis = getRedisClient();
    await redis.del(hourlyKey, lastSendKey);
  },
};
