import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { User } from '@prisma/client';
import { UnauthorizedError } from '../errors/appErrors.js';

export interface GoogleProfileData {
  googleId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface JwtPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

export const AUTH_COOKIE_NAME = 'mailflow_token';

export const authService = {
  /**
   * Upserts a User record based on Google OAuth profile data.
   * Reuses existing user account by googleId or email, preventing duplicate accounts.
   */
  async upsertGoogleUser(profile: GoogleProfileData): Promise<User> {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ googleId: profile.googleId }, { email: profile.email.toLowerCase() }],
      },
    });

    if (existingUser) {
      return prisma.user.update({
        where: { id: existingUser.id },
        data: {
          googleId: profile.googleId,
          email: profile.email.toLowerCase(),
          name: profile.name || existingUser.name,
          avatarUrl: profile.avatarUrl || existingUser.avatarUrl,
        },
      });
    }

    return prisma.user.create({
      data: {
        googleId: profile.googleId,
        email: profile.email.toLowerCase(),
        name: profile.name || 'MailFlow User',
        avatarUrl: profile.avatarUrl || null,
      },
    });
  },

  /**
   * Generates a signed JWT session token for an internal User ID.
   */
  generateToken(userId: string): string {
    return jwt.sign({ userId }, env.JWT_SECRET, {
      expiresIn: '7d',
    });
  },

  /**
   * Verifies and decodes an application JWT session token.
   */
  verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    } catch (error) {
      throw new UnauthorizedError('Invalid or expired authentication session token.');
    }
  },

  /**
   * Returns standard HTTP-Only cookie configuration options.
   */
  getCookieOptions() {
    return {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      path: '/',
    };
  },
};
