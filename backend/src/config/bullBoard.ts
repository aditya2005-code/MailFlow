import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getEmailQueue } from '../queues/index.js';

let serverAdapterInstance: ExpressAdapter | null = null;

/**
 * Initializes and mounts Bull Board dashboard monitoring the unified MailFlow email queue.
 *
 * Configures ExpressAdapter with base path '/admin/queues'.
 */
export function getBullBoardAdapter(): ExpressAdapter {
  if (!serverAdapterInstance) {
    serverAdapterInstance = new ExpressAdapter();
    serverAdapterInstance.setBasePath('/admin/queues');

    const emailQueue = getEmailQueue();

    createBullBoard({
      queues: [new BullMQAdapter(emailQueue)],
      serverAdapter: serverAdapterInstance,
    });
  }

  return serverAdapterInstance;
}
