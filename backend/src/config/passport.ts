import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from './env.js';
import { authService } from '../services/authService.js';

/**
 * Initializes Passport Google OAuth 2.0 Strategy.
 */
export function configurePassport(): typeof passport {
  const clientID = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const callbackURL = env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback';

  if (clientID && clientSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID,
          clientSecret,
          callbackURL,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails && profile.emails[0] ? profile.emails[0].value : undefined;
            if (!email) {
              return done(new Error('No email address provided by Google profile.'), undefined);
            }

            const user = await authService.upsertGoogleUser({
              googleId: profile.id,
              email,
              name: profile.displayName,
              avatarUrl: profile.photos && profile.photos[0] ? profile.photos[0].value : undefined,
            });

            return done(null, user);
          } catch (error) {
            return done(error as Error, undefined);
          }
        },
      ),
    );
    console.log('[passport] 🔑 Passport Google OAuth strategy initialized.');
  } else {
    console.warn('[passport] ⚠️ GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing. Real Google OAuth login disabled.');
  }

  return passport;
}
