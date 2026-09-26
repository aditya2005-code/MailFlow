import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables as early as possible
dotenv.config();

/**
 * Zod schema defining the environment variable contract and defaults.
 */
const envSchema = z.object({
  // ─── Application ─────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // ─── PostgreSQL / Prisma ─────────────────────────────────────────────────────
  // Optional at startup so infrastructure health checks work without active DB connection
  DATABASE_URL: z.string().default(''),

  // ─── Redis ───────────────────────────────────────────────────────────────────
  REDIS_URL: z.string().optional().transform((val) => val || undefined),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().transform((val) => val || undefined),

  // ─── OpenSearch / Elasticsearch ─────────────────────────────────────────────
  OPENSEARCH_URL: z.string().optional().transform((val) => val || undefined),
  OPENSEARCH_USERNAME: z.string().optional().transform((val) => val || undefined),
  OPENSEARCH_PASSWORD: z.string().optional().transform((val) => val || undefined),
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),

  // ─── Google OAuth ────────────────────────────────────────────────────────────
  GOOGLE_CLIENT_ID: z.string().optional().transform((val) => val || undefined),
  GOOGLE_CLIENT_SECRET: z.string().optional().transform((val) => val || undefined),
  GOOGLE_CALLBACK_URL: z.string().optional().transform((val) => val || undefined),

  // ─── Sessions / Auth ─────────────────────────────────────────────────────────
  SESSION_SECRET: z.string().default('dev-session-secret-change-in-production'),
  JWT_SECRET: z.string().default('dev-jwt-secret-mailflow-2026-production-change'),

  // ─── Slack OAuth ─────────────────────────────────────────────────────────────
  SLACK_CLIENT_ID: z.string().optional().transform((val) => val || undefined),
  SLACK_CLIENT_SECRET: z.string().optional().transform((val) => val || undefined),
  SLACK_REDIRECT_URI: z.string().optional().transform((val) => val || undefined),

  // ─── Worker configuration ────────────────────────────────────────────────────
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MIN_EMAIL_DELAY_MS: z.coerce.number().int().nonnegative().default(2000),
  MAX_EMAILS_PER_HOUR: z.coerce.number().int().positive().default(100),

  // ─── Ethereal SMTP ───────────────────────────────────────────────────────────
  ETHEREAL_HOST: z.string().optional().transform((val) => val || undefined),
  ETHEREAL_PORT: z.preprocess(
    (val) => (val !== undefined && val !== '' ? Number(val) : undefined),
    z.number().int().positive().optional(),
  ),
  ETHEREAL_USER: z.string().optional().transform((val) => val || undefined),
  ETHEREAL_PASSWORD: z.string().optional().transform((val) => val || undefined),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Environment variable validation failed:');
  for (const issue of parsedEnv.error.issues) {
    const fieldPath = issue.path.join('.');
    console.error(`   - ${fieldPath}: ${issue.message}`);
  }
  throw new Error('Invalid environment variable configuration.');
}

/**
 * Validated, strongly typed environment configuration singleton.
 */
export const env = parsedEnv.data;
export type Env = z.infer<typeof envSchema>;
