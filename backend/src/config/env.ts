import dotenv from 'dotenv';

// Load environment variables as early as possible
dotenv.config();


function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  // ─── Server ─────────────────────────────────────────────────────────────────
  NODE_ENV: optionalEnv('NODE_ENV', 'development') as 'development' | 'production' | 'test',
  PORT: parseInt(optionalEnv('PORT', '5000'), 10),
  FRONTEND_URL: optionalEnv('FRONTEND_URL', 'http://localhost:3000'),

  // ─── Database ────────────────────────────────────────────────────────────────
  // Deliberately optional at startup — Prisma will surface a connection error
  // only when a query is actually attempted (health check must work without DB).
  DATABASE_URL: optionalEnv('DATABASE_URL', ''),

  // ─── Redis ───────────────────────────────────────────────────────────────────
  REDIS_HOST: optionalEnv('REDIS_HOST', 'localhost'),
  REDIS_PORT: parseInt(optionalEnv('REDIS_PORT', '6379'), 10),
  REDIS_PASSWORD: process.env['REDIS_PASSWORD'] || undefined,

  // ─── Elasticsearch ───────────────────────────────────────────────────────────
  ELASTICSEARCH_URL: optionalEnv('ELASTICSEARCH_URL', 'http://localhost:9200'),

  // ─── Google OAuth ────────────────────────────────────────────────────────────
  GOOGLE_CLIENT_ID: process.env['GOOGLE_CLIENT_ID'],
  GOOGLE_CLIENT_SECRET: process.env['GOOGLE_CLIENT_SECRET'],
  GOOGLE_CALLBACK_URL: process.env['GOOGLE_CALLBACK_URL'],

  // ─── Session ─────────────────────────────────────────────────────────────────
  SESSION_SECRET: optionalEnv('SESSION_SECRET', 'changeme-in-production'),

  // ─── Slack OAuth ─────────────────────────────────────────────────────────────
  SLACK_CLIENT_ID: process.env['SLACK_CLIENT_ID'],
  SLACK_CLIENT_SECRET: process.env['SLACK_CLIENT_SECRET'],
  SLACK_REDIRECT_URI: process.env['SLACK_REDIRECT_URI'],

  // ─── Worker / Rate Limiting ──────────────────────────────────────────────────
  WORKER_CONCURRENCY: parseInt(optionalEnv('WORKER_CONCURRENCY', '5'), 10),
  MIN_EMAIL_DELAY_MS: parseInt(optionalEnv('MIN_EMAIL_DELAY_MS', '1000'), 10),
  MAX_EMAILS_PER_HOUR: parseInt(optionalEnv('MAX_EMAILS_PER_HOUR', '100'), 10),

  // ─── Ethereal SMTP ───────────────────────────────────────────────────────────
  ETHEREAL_HOST: process.env['ETHEREAL_HOST'],
  ETHEREAL_PORT: process.env['ETHEREAL_PORT']
    ? parseInt(process.env['ETHEREAL_PORT'], 10)
    : undefined,
  ETHEREAL_USER: process.env['ETHEREAL_USER'],
  ETHEREAL_PASSWORD: process.env['ETHEREAL_PASSWORD'],
} as const;

export type Env = typeof env;
