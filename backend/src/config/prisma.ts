import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { env } from './env.js';

/**
 * Singleton PrismaClient instance using @prisma/adapter-pg driver adapter.
 * Configured specifically for Neon PostgreSQL (free-tier serverless PostgreSQL with SSL).
 */

const connectionString = env.DATABASE_URL;
const isNeon = connectionString.includes('neon.tech') || connectionString.includes('sslmode=require');

// Configure pg Pool with SSL options for Neon PostgreSQL
const pool = new pg.Pool({
  connectionString,
  ssl: isNeon ? { rejectUnauthorized: false } : undefined,
});

const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export interface DatabaseHealthResult {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

/**
 * Lightweight connectivity check for PostgreSQL / Prisma health checks.
 */
export async function checkDatabaseHealth(timeoutMs = 10000): Promise<DatabaseHealthResult> {
  if (!env.DATABASE_URL) {
    return {
      status: 'down',
      error: 'DATABASE_URL is not configured',
    };
  }

  const startTime = Date.now();
  let timerId: NodeJS.Timeout | undefined;

  try {
    const queryPromise = prisma.$queryRaw<Array<{ connected: number }>>`SELECT 1 as connected`;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => reject(new Error('Database query timed out')), timeoutMs);
    });

    await Promise.race([queryPromise, timeoutPromise]);
    const latencyMs = Date.now() - startTime;

    return {
      status: 'up',
      latencyMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'down',
      error: errorMessage.includes('timed out') ? 'Database query timed out' : 'Database connection failed',
    };
  } finally {
    if (timerId) {
      clearTimeout(timerId);
    }
  }
}

export default prisma;
