import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import healthRouter from './routes/health.js';
import apiRouter from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

/**
 * Creates and configures the Express application.
 *
 * Deliberately kept separate from server startup so that the app instance
 * can be imported cleanly in integration tests without binding to a port.
 */
export function createApp(): Application {
  const app = express();

  // ─── Security ────────────────────────────────────────────────────────────────
  app.use(helmet());

  // ─── CORS ────────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-dev-user-id'],
    }),
  );

  // ─── Body Parsers ─────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ─── HTTP Request Logging ────────────────────────────────────────────────────
  const morganFormat = env.NODE_ENV === 'production' ? 'combined' : 'dev';
  app.use(morgan(morganFormat));

  // ─── Direct Health Check Shortcut ────────────────────────────────────────────
  app.use('/health', healthRouter);

  // ─── API Routes ───────────────────────────────────────────────────────────────
  app.use('/api/v1', apiRouter);

  // ─── 404 + Error Handling (must be last) ─────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
