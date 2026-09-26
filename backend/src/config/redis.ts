import Redis, { RedisOptions } from 'ioredis';
import { env } from './env.js';

/**
 * Redis connection options for ioredis and BullMQ.
 * Note: BullMQ requires `maxRetriesPerRequest: null` for standard queue operations.
 */
function getBaseRedisOptions(): RedisOptions {
  if (env.REDIS_URL) {
    const isTls = env.REDIS_URL.startsWith('rediss://');
    const parsedClient = new Redis(env.REDIS_URL, { lazyConnect: true });
    const parsedOpts = parsedClient.options;
    return {
      ...parsedOpts,
      ...(isTls && !parsedOpts.tls ? { tls: {} } : {}),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    };
  }

  const isRemoteHost = env.REDIS_HOST !== 'localhost' && env.REDIS_HOST !== '127.0.0.1';
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    ...(isRemoteHost ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  };
}

export const redisOptions: RedisOptions = getBaseRedisOptions();

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
export async function checkRedisHealth(timeoutMs = 5000): Promise<RedisHealthResult> {
  const client = getRedisClient();
  const startTime = Date.now();
  let timerId: NodeJS.Timeout | undefined;

  try {
    const pingPromise = (async () => {
      if (client.status === 'wait') {
        await client.connect();
      }
      return client.ping();
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => reject(new Error('Redis ping timed out')), timeoutMs);
    });

    const response = await Promise.race([pingPromise, timeoutPromise]);
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
      error: errorMessage.includes('timed out') ? 'Redis ping timed out' : 'Redis connection failed',
    };
  } finally {
    if (timerId) {
      clearTimeout(timerId);
    }
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
