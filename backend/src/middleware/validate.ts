import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { ValidationError } from '../errors/appErrors.js';

export interface RequestValidationSchemas {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
}

/**
 * Reusable Express request validation middleware wrapping Zod schemas.
 * Validates request body, query parameters, and route parameters.
 */
export function validateRequest(schemas: RequestValidationSchemas) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.params) {
        req.params = (await schemas.params.parseAsync(req.params)) as any;
      }
      if (schemas.query) {
        const parsedQuery = await schemas.query.parseAsync(req.query);
        Object.assign(req.query, parsedQuery);
      }
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedMessage = error.issues
          .map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`)
          .join('; ');
        next(new ValidationError(formattedMessage));
      } else {
        next(error);
      }
    }
  };
}
