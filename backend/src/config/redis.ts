import Redis, { RedisOptions } from 'ioredis';
import { env } from './env.js';

/**
 * Redis connection options for ioredis and BullMQ.
 * Note: BullMQ requires `maxRetriesPerRequest: null` for standard queue operations.
 */
export const redisOptions: RedisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
};

let redisClientInstance: Redis | null = null;

/**
 * Get or initialize a singleton ioredis client instance.
 */
export function getRedisClient(): Redis {
  if (!redisClientInstance) {
    redisClientInstance = new Redis(redisOptions);

    redisClientInstance.on('error', (err) => {
      console.error('[redis] Redis client error:', err.message);
    });
  }

  return redisClientInstance;
}

export interface RedisHealthResult {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

/**
 * Lightweight connectivity check for Redis reachable verification.
 */
export async function checkRedisHealth(): Promise<RedisHealthResult> {
  const client = getRedisClient();
  const startTime = Date.now();

  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    
    const response = await client.ping();
    const latencyMs = Date.now() - startTime;

    if (response === 'PONG') {
      return {
        status: 'up',
        latencyMs,
      };
    }

    return {
      status: 'down',
      error: `Unexpected ping response: ${response}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'down',
      error: errorMessage,
    };
  }
}

/**
 * Close Redis client connection gracefully (used in shutdown hooks / tests).
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClientInstance) {
    await redisClientInstance.quit();
    redisClientInstance = null;
  }
}
