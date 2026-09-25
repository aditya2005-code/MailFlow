import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import healthRouter from './routes/health.js';
import apiRouter from './routes/index.js';
import authRouter from './routes/auth.routes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { configurePassport } from './config/passport.js';
import { getBullBoardAdapter } from './config/bullBoard.js';

/**
 * Creates and configures the Express application.
 *
 * Deliberately kept separate from server startup so that the app instance
 * can be imported cleanly in integration tests without binding to a port.
 */
export function createApp(): Application {
  const app = express();

  // ─── Passport & OAuth Setup ──────────────────────────────────────────────────
  const passport = configurePassport();
  app.use(passport.initialize());

  // ─── Security ────────────────────────────────────────────────────────────────
  app.use(helmet());

  // ─── Cookie Parser ───────────────────────────────────────────────────────────
  app.use(cookieParser());

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

  // ─── Auth Routes (/api/auth & /api/v1/auth) ──────────────────────────────────
  app.use('/api/auth', authRouter);
  app.use('/api/v1/auth', authRouter);

  // ─── Bull Board Dashboard Route ─────────────────────────────────────────────
  const bullBoardAdapter = getBullBoardAdapter();
  app.use('/admin/queues', bullBoardAdapter.getRouter());

  // ─── API Routes ───────────────────────────────────────────────────────────────
  app.use('/api/v1', apiRouter);

  // ─── 404 + Error Handling (must be last) ─────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
