import { EmailStatus } from '@prisma/client';
import { emailService } from './emailService.js';
import { emailRepository } from '../repositories/emailRepository.js';
import { addEmailJob, removeEmailJob, getEmailJob } from '../queues/index.js';
import { ConflictError, ValidationError } from '../errors/appErrors.js';

export const schedulerService = {
  /**
   * Schedules a PostgreSQL email record into BullMQ as a delayed job.
   *
   * Uses `jobId = email.id` to guarantee queue-level idempotency:
   * calling scheduleEmail multiple times for the same email record will not create duplicate jobs.
   *
   * @param userId Authenticated user ID (for ownership validation)
   * @param emailId PostgreSQL Email primary key CUID
   */
  async scheduleEmail(userId: string, emailId: string) {
    const email = await emailService.getEmailById(userId, emailId);

    if (email.status !== EmailStatus.SCHEDULED) {
      throw new ConflictError(
        `Cannot schedule email because its current status is '${email.status}'. Only SCHEDULED emails can be queued.`,
      );
    }

    const scheduledTime = new Date(email.scheduledAt).getTime();
    const now = Date.now();
    const delay = Math.max(0, scheduledTime - now);

    // Enqueue BullMQ delayed job with jobId = email.id for idempotency
    const job = await addEmailJob(email.id, delay);

    return {
      email,
      jobId: job.id,
      delay,
      scheduledAt: email.scheduledAt,
    };
  },

  /**
   * Cancels a scheduled email.
   *
   * Removes the delayed BullMQ job from Redis and updates the PostgreSQL record status safely.
   * Prevents cancelling emails that are already PROCESSING, SENT, or FAILED.
   *
   * @param userId Authenticated user ID
   * @param emailId Email primary key CUID
   */
  async cancelEmail(userId: string, emailId: string) {
    const email = await emailService.getEmailById(userId, emailId);

    if (email.status !== EmailStatus.SCHEDULED) {
      throw new ConflictError(
        `Cannot cancel email with status '${email.status}'. Only SCHEDULED emails can be cancelled.`,
      );
    }

    // Remove delayed job from BullMQ queue if present
    const jobRemoved = await removeEmailJob(emailId);

    // Transition database record status safely
    const updatedEmail = await emailService.cancelScheduledEmail(userId, emailId);

    return {
      email: updatedEmail,
      jobRemoved,
    };
  },

  /**
   * Reschedules an existing scheduled email to a new target date/time.
   *
   * Updates `scheduledAt` in PostgreSQL, removes any existing BullMQ job, and
   * re-enqueues a new delayed job with the updated delay.
   *
   * @param userId Authenticated user ID
   * @param emailId Email primary key CUID
   * @param newScheduledAt New target Date object
   */
  async rescheduleEmail(userId: string, emailId: string, newScheduledAt: Date) {
    if (!newScheduledAt || isNaN(newScheduledAt.getTime())) {
      throw new ValidationError('A valid new scheduledAt date is required for rescheduling.');
    }

    const email = await emailService.getEmailById(userId, emailId);

    if (email.status !== EmailStatus.SCHEDULED) {
      throw new ConflictError(
        `Cannot reschedule email with status '${email.status}'. Only SCHEDULED emails can be rescheduled.`,
      );
    }

    // 1. Remove existing BullMQ job if present
    await removeEmailJob(emailId);

    // 2. Update scheduledAt in PostgreSQL (source of truth)
    const updatedEmail = await emailRepository.update(emailId, {
      scheduledAt: newScheduledAt,
    });

    // 3. Calculate new delay and add BullMQ delayed job
    const delay = Math.max(0, newScheduledAt.getTime() - Date.now());
    const newJob = await addEmailJob(emailId, delay);

    return {
      email: updatedEmail,
      jobId: newJob.id,
      delay,
      scheduledAt: updatedEmail.scheduledAt,
    };
  },
};
