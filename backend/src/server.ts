/**
 * server.ts — Entry point.
 *
 * Responsibilities:
 *  1. Load environment config (dotenv is called inside config/env.ts)
 *  2. Create the Express app
 *  3. Bind to the configured port
 *  4. Handle graceful shutdown signals
 *
 * Kept deliberately lean; business logic lives in app.ts and below.
 */
import http from 'http';
import { env } from './config/env.js';
import { createApp } from './app.js';

const app = createApp();
const server = http.createServer(app);

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] ❌ Port ${env.PORT} is already in use by another process.`);
    console.error(`[server] Free port ${env.PORT} or run process cleanup before starting MailFlow backend.`);
    process.exit(1);
  } else {
    console.error('[server] Server error:', err);
    process.exit(1);
  }
});

server.listen(env.PORT, () => {
  console.log(
    `[server] MailFlow backend is running` +
      ` | env=${env.NODE_ENV}` +
      ` | port=${env.PORT}` +
      ` | http://localhost:${env.PORT}/api/v1/health`,
  );
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
function shutdown(signal: string): void {
  console.log(`[server] Received ${signal}. Shutting down gracefully…`);
  server.close(() => {
    console.log('[server] HTTP server closed.');
    process.exit(0);
  });

  // Force-exit after 10 s if connections do not drain in time
  setTimeout(() => {
    console.error('[server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => { shutdown('SIGTERM'); });
process.on('SIGINT',  () => { shutdown('SIGINT'); });

// Prevent silent crashes in production
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
  process.exit(1);
});
