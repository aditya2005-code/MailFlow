import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { UnauthorizedError } from '../errors/appErrors.js';

// Constant fallback ID used during Phase 2 local development before Phase 6 Google OAuth
const DEV_DEFAULT_GOOGLE_ID = 'dev-google-user-id-001';
const DEV_DEFAULT_EMAIL = 'dev.user@mailflow.local';
const DEV_DEFAULT_NAME = 'Development User';

let cachedDevUserId: string | null = null;

/**
 * Ensures a development user exists in the database for Phase 2 local API testing.
 */
async function getOrCreateDevUserId(): Promise<string> {
  if (cachedDevUserId) {
    return cachedDevUserId;
  }

  const existingUser = await prisma.user.findUnique({
    where: { googleId: DEV_DEFAULT_GOOGLE_ID },
  });

  if (existingUser) {
    cachedDevUserId = existingUser.id;
    return existingUser.id;
  }

  const newUser = await prisma.user.create({
    data: {
      googleId: DEV_DEFAULT_GOOGLE_ID,
      email: DEV_DEFAULT_EMAIL,
      name: DEV_DEFAULT_NAME,
    },
  });

  cachedDevUserId = newUser.id;
  return newUser.id;
}

/**
 * Temporary development user-identification middleware.
 *
 * Reads optional `x-dev-user-id` header or resolves a default development User ID.
 * Attaches `req.userId` for downstream controller & service ownership checks.
 *
 * NOTE: This will be cleanly replaced by Passport Google OAuth authentication in Phase 6.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const customDevUserId = req.headers['x-dev-user-id'] as string | undefined;

    if (customDevUserId && customDevUserId.trim() !== '') {
      req.userId = customDevUserId.trim();
      next();
      return;
    }

    req.userId = await getOrCreateDevUserId();
    next();
  } catch (error) {
    next(new UnauthorizedError('Failed to resolve development user context.'));
  }
}
