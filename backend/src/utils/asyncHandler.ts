import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Reusable wrapper for async Express route handlers.
 * Ensures any rejected Promise automatically passes the error to next().
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
