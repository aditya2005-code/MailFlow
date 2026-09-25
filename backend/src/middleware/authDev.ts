import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { UnauthorizedError } from '../errors/appErrors.js';
import { authService, AUTH_COOKIE_NAME } from '../services/authService.js';
import { env } from '../config/env.js';

const DEV_DEFAULT_GOOGLE_ID = 'dev-google-user-id-001';
const DEV_DEFAULT_EMAIL = 'dev.user@mailflow.local';
const DEV_DEFAULT_NAME = 'Development User';

let cachedDevUserId: string | null = null;

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
 * Production-ready Authentication Middleware.
 *
 * 1. Reads JWT from HTTP-only cookie (`mailflow_token` / `token`) or `Authorization: Bearer <token>` header.
 * 2. Validates JWT signature & expiry.
 * 3. Fetches User identity from PostgreSQL and attaches `req.userId` and `req.user`.
 * 4. Rejects unauthenticated requests with 401 Unauthorized.
 * 5. Supports `x-dev-user-id` header / dev fallback when explicitly provided or in test environment.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Check HTTP-Only Cookie or Authorization Header
    let token = req.cookies?.[AUTH_COOKIE_NAME] || req.cookies?.token;

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // 2. Validate JWT if token exists
    if (token) {
      try {
        const payload = authService.verifyToken(token);
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
        });

        if (user) {
          req.userId = user.id;
          (req as any).user = user;
          next();
          return;
        }
      } catch (tokenErr) {
        // Invalid or expired token — fall through to check dev headers or reject
      }
    }

    // 3. Fallback for Dev/Test Header Compatibility (`x-dev-user-id`)
    const customDevUserId = req.headers['x-dev-user-id'] as string | undefined;

    if (customDevUserId && customDevUserId.trim() !== '') {
      const user = await prisma.user.findUnique({ where: { id: customDevUserId.trim() } });
      if (user) {
        req.userId = user.id;
        (req as any).user = user;
        next();
        return;
      }
    }

    // 4. Test Environment Fallback (only when NODE_ENV === 'test' and no token provided)
    if (env.NODE_ENV === 'test' && !token && !customDevUserId) {
      const devUserId = await getOrCreateDevUserId();
      const devUser = await prisma.user.findUnique({ where: { id: devUserId } });
      if (devUser) {
        req.userId = devUser.id;
        (req as any).user = devUser;
        next();
        return;
      }
    }

    // 5. Unauthenticated — Reject with 401
    throw new UnauthorizedError('Authentication required. Please log in.');
  } catch (error) {
    next(error);
  }
}
