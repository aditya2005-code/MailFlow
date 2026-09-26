import { getEmailWorker, closeEmailWorker } from './emailWorker.js';
import { closeRedisClient } from '../config/redis.js';
import { prisma } from '../config/prisma.js';

/**
 * Standalone worker entrypoint for MailFlow background email processing.
 * Can be run independently via `npm run worker`.
 */
async function startWorkerProcess() {
  console.log('[worker-process] MailFlow email worker process started.');

  const worker = getEmailWorker();

  async function shutdown(signal: string) {
    console.log(`\n[worker-process] Received ${signal}. Initiating graceful shutdown...`);
    try {
      await closeEmailWorker();
      await prisma.$disconnect().catch(() => {});
      await closeRedisClient().catch(() => {});
      console.log('[worker-process] All worker resources closed cleanly.');
      process.exit(0);
    } catch (error) {
      console.error('[worker-process] Error during shutdown:', error);
      process.exit(1);
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    console.error('[worker-process] Unhandled rejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[worker-process] Uncaught exception:', err);
    shutdown('uncaughtException');
  });
}

startWorkerProcess();
