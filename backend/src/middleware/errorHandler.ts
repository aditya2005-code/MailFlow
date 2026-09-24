import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { HttpError, ApiResponse } from '../types/index.js';

/**
 * Central error-handling middleware.
 * Must be registered LAST (after all routes) in app.ts.
 * Express recognises it as an error handler because it has 4 parameters.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // --- Typed HTTP errors we throw intentionally ---------------------------------
  if (err instanceof HttpError) {
    const body: ApiResponse = {
      success: false,
      error: err.message,
      ...(err.code ? { message: err.code } : {}),
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // --- Unknown / unhandled errors -----------------------------------------------
  const isDev = env.NODE_ENV === 'development';

  // Log to stderr so it shows up in container logs
  console.error('[ErrorHandler]', err);

  const body: ApiResponse = {
    success: false,
    error: isDev && err instanceof Error ? err.message : 'Internal server error',
  };

  res.status(500).json(body);
}

/**
 * 404 catch-all — must be registered BEFORE errorHandler but AFTER all routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiResponse = {
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  };
  res.status(404).json(body);
}
