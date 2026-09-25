import { Queue, JobsOptions } from 'bullmq';
import { redisOptions } from '../config/redis.js';

/**
 * Queue Name Constant.
 * Unified single source of truth for the BullMQ email scheduler queue name.
 */
export const EMAIL_QUEUE_NAME = 'email-scheduler';

/**
 * Job Name Constant.
 * Unified single source of truth for email processing jobs handled by future workers.
 */
export const SEND_EMAIL_JOB_NAME = 'send-email';

/**
 * Strongly-typed job payload interface.
 * Minimal payload storing only the PostgreSQL primary key (emailId).
 * Worker retrieves full recipient, campaign, and template details from PostgreSQL.
 */
export interface EmailJobPayload {
  emailId: string;
}

/**
 * Default BullMQ job options configured for production reliability & observability:
 * - attempts: 3 retry attempts for transient worker failures
 * - backoff: Exponential backoff starting at 5000ms (5s, 10s, 20s)
 * - removeOnComplete: Retain completed jobs for 24h or up to 1000 jobs for debugging/Bull Board
 * - removeOnFail: Retain failed jobs for 7 days or up to 5000 jobs for inspection and retries
 */
export const defaultEmailJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000, // 1s initial delay (1s, 2s, 4s...)
  },
  removeOnComplete: {
    age: 86400, // 24 hours
    count: 1000,
  },
  removeOnFail: {
    age: 604800, // 7 days
    count: 5000,
  },
};

let emailQueueInstance: Queue<EmailJobPayload> | null = null;

/**
 * Initializes or returns the singleton BullMQ Queue instance for email scheduling.
 */
export function getEmailQueue(): Queue<EmailJobPayload> {
  if (!emailQueueInstance) {
    const queue = new Queue<EmailJobPayload>(EMAIL_QUEUE_NAME, {
      connection: redisOptions as any,
      defaultJobOptions: defaultEmailJobOptions,
    });

    queue.on('error', (err) => {
      console.error(`[bullmq:${EMAIL_QUEUE_NAME}] Queue error:`, err.message);
    });

    emailQueueInstance = queue;
  }

  return emailQueueInstance;
}

/**
 * Adds an email job to the queue.
 *
 * Uses `jobId: emailId` to enforce strict queue-level idempotency:
 * duplicate jobs for the same PostgreSQL email ID cannot be queued concurrently.
 *
 * @param emailId PostgreSQL email primary key
 * @param delayMs Optional delay in milliseconds for future scheduled delivery
 */
export async function addEmailJob(emailId: string, delayMs = 0) {
  const queue = getEmailQueue();
  const options: JobsOptions = {
    jobId: emailId,
    ...(delayMs > 0 ? { delay: delayMs } : {}),
  };

  return queue.add(SEND_EMAIL_JOB_NAME, { emailId }, options);
}

/**
 * Retrieves an existing email job from the queue by its email ID.
 */
export async function getEmailJob(emailId: string) {
  const queue = getEmailQueue();
  return queue.getJob(emailId);
}

/**
 * Removes an email job from the queue (used during email cancellation prior to sending).
 */
export async function removeEmailJob(emailId: string): Promise<boolean> {
  const job = await getEmailJob(emailId);
  if (job) {
    await job.remove();
    return true;
  }
  return false;
}

/**
 * Gracefully closes the BullMQ email queue connection.
 */
export async function closeEmailQueue(): Promise<void> {
  if (emailQueueInstance) {
    await emailQueueInstance.close();
    emailQueueInstance = null;
  }
}
