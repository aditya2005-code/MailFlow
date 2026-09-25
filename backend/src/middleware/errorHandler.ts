import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { HttpError, ApiResponse } from '../types/index.js';
import { Prisma } from '@prisma/client';

/**
 * Centralized Express error-handling middleware.
 * Must be registered LAST (after all routes) in app.ts.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // ─── Typed Application HTTP Errors ─────────────────────────────────────────
  if (err instanceof HttpError) {
    const body: ApiResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // ─── Prisma Database Errors ────────────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'CONFLICT',
          message: `A record with this ${target} already exists.`,
        },
      };
      res.status(409).json(body);
      return;
    }

    if (err.code === 'P2025') {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'The requested database record was not found.',
        },
      };
      res.status(404).json(body);
      return;
    }
  }

  // ─── Unhandled / Internal Server Errors ────────────────────────────────────
  const isDev = env.NODE_ENV === 'development';
  console.error('[ErrorHandler]', err);

  const errorMessage = isDev && err instanceof Error ? err.message : 'Internal server error';

  const body: ApiResponse = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: errorMessage,
    },
  };

  res.status(500).json(body);
}

/**
 * 404 catch-all middleware — registered BEFORE errorHandler but AFTER all routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.path}`,
    },
  };
  res.status(404).json(body);
}
