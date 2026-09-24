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

export default prisma;
