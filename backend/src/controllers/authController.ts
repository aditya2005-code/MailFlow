import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { authService, AUTH_COOKIE_NAME } from '../services/authService.js';
import { userService } from '../services/userService.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { User } from '@prisma/client';

/**
 * Redirects client to Google OAuth 2.0 consent screen.
 */
export const googleAuth = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
};

/**
 * Helper to construct safe, normalized frontend redirect URLs.
 * Prevents double path concatenation such as /dashboard/dashboard when FRONTEND_URL includes path suffixes.
 */
function getFrontendRedirectUrl(path: string): string {
  const baseUrl = (env.FRONTEND_URL || 'http://localhost:5173')
    .replace(/\/+$/, '')
    .replace(/\/dashboard\/?$/, '')
    .replace(/\/login\/?$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

/**
 * Handles Google OAuth 2.0 authorization code callback.
 *
 * Exchanges code for user profile, upserts User record, generates JWT token,
 * sets HTTP-Only cookie, and redirects to FRONTEND_URL.
 */
export const googleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('google', { session: false }, (err: any, user: User | false) => {
    if (err || !user) {
      console.error('[auth] ❌ Google OAuth authentication failed:', err?.message || 'Denied/Failed');
      return res.redirect(getFrontendRedirectUrl('/login?error=oauth_failed'));
    }

    const token = authService.generateToken(user.id);
    const cookieOpts = authService.getCookieOptions();
    res.cookie(AUTH_COOKIE_NAME, token, cookieOpts);

    const redirectTarget = getFrontendRedirectUrl('/dashboard');
    console.log(`[auth] ✅ Google OAuth succeeded for user: ${user.email} (ID: ${user.id})`);
    console.log(`[auth] 🍪 Set-Cookie: ${AUTH_COOKIE_NAME} (secure=${cookieOpts.secure}, sameSite=${cookieOpts.sameSite})`);
    console.log(`[auth] ↗️ Redirecting to frontend dashboard: ${redirectTarget}`);

    return res.redirect(redirectTarget);
  })(req, res, next);
};

/**
 * Returns authenticated user profile identity.
 */
export const getCurrentUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user || (await userService.getUserById(req.userId!));
  res.status(200).json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl || null,
    },
  });
});

/**
 * Invalidates authenticated session by clearing HTTP-Only cookie.
 */
export const logout = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  res.clearCookie(AUTH_COOKIE_NAME, authService.getCookieOptions());
  res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
});
