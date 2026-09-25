import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { EmailStatus } from '@prisma/client';
import { EMAIL_QUEUE_NAME, EmailJobPayload, addEmailJob } from '../queues/index.js';
import { redisOptions } from '../config/redis.js';
import { env } from '../config/env.js';
import { emailRepository } from '../repositories/emailRepository.js';
import { getSmtpTransporter } from '../config/smtp.js';
import { rateLimitService } from '../services/rateLimitService.js';

let emailWorkerInstance: Worker<EmailJobPayload> | null = null;

/**
 * ====================================================================================
 * EXACTLY-ONCE EMAIL DELIVERY LIMITATION NOTICE & ARCHITECTURAL IDEMPOTENCY DESIGN
 * ====================================================================================
 *
 * True exactly-once email delivery cannot be guaranteed with ordinary SMTP protocols.
 * There is a theoretical failure window where the remote SMTP server accepts the email,
 * but the worker process crashes (e.g. SIGKILL, power failure) before updating the PostgreSQL
 * database state from 'PROCESSING' to 'SENT'.
 *
 * MailFlow addresses this by providing strong application-level idempotency:
 * 1. Queue-level idempotency: BullMQ job ID matches PostgreSQL primary key (jobId = email.id).
 * 2. Database-level atomic claim: Conditional UPDATE (WHERE id = emailId AND status = SCHEDULED).
 * 3. Pre-send status checks: Safe skipping of emails already in 'SENT' or 'FAILED' state.
 * 4. Stalled-job recovery: Controlled re-execution via BullMQ stalled-job lock management.
 * 5. Distributed rate-limiting: Redis-backed atomic reservation for hourly & min-delay slots.
 * ====================================================================================
 */

/**
 * Core processor for email sending jobs.
 *
 * Handles idempotency checks, distributed rate limiting, atomic status transitions,
 * Nodemailer SMTP delivery, sanitized error tracking, and BullMQ retry integration.
 */
export async function processEmailJob(job: Job<EmailJobPayload>): Promise<any> {
  const { emailId } = job.data;
  const currentAttempt = (job.attemptsMade || 0) + 1;
  const maxAttempts = job.opts?.attempts || 3;

  console.log(
    `[worker] 📥 Job ${job.id} started for emailId: ${emailId} (Attempt ${currentAttempt}/${maxAttempts})`,
  );

  // 1. Retrieve Email record from PostgreSQL (source of truth)
  const email = await emailRepository.findById(emailId);

  if (!email) {
    const errorMsg = `Email record with ID '${emailId}' not found in database.`;
    console.error(`[worker] ❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // 2. Idempotency Check — Skip if already SENT
  if (email.status === EmailStatus.SENT) {
    console.log(`[worker] ℹ️ Email ${emailId} is already marked SENT. Skipping duplicate execution.`);
    return { status: 'skipped', reason: 'already_sent' };
  }

  // 3. Skip if already FAILED (and not being manually re-scheduled)
  if (email.status === EmailStatus.FAILED && currentAttempt === 1) {
    console.log(`[worker] ℹ️ Email ${emailId} is marked FAILED. Skipping execution.`);
    return { status: 'skipped', reason: 'already_failed' };
  }

  // 4. Pre-claim check if currently PROCESSING
  if (email.status === EmailStatus.PROCESSING && currentAttempt === 1) {
    console.warn(`[worker] ⚠️ Email ${emailId} is currently being processed by another worker. Skipping.`);
    return { status: 'skipped', reason: 'already_processing' };
  }

  // 5. Distributed Rate Limit & Inter-Email Delay Reservation
  const rateLimitResult = await rateLimitService.acquireSendSlot();

  if (!rateLimitResult.allowed) {
    console.log(
      `[worker] ⏳ Rate limit enforced (${rateLimitResult.reason}). Rescheduling email ${emailId} with ${rateLimitResult.delayMs}ms delay...`,
    );

    // Re-enqueue delayed job in BullMQ without dropping or failing the email
    await addEmailJob(emailId, rateLimitResult.delayMs);

    return {
      status: 'rescheduled',
      reason: rateLimitResult.reason,
      delayMs: rateLimitResult.delayMs,
      nextAvailableTimeMs: rateLimitResult.nextAvailableTimeMs,
    };
  }

  // 6. Atomic Status Transition (SCHEDULED -> PROCESSING)
  if (email.status === EmailStatus.SCHEDULED) {
    const claimed = await emailRepository.updateStatusAtomic(
      emailId,
      EmailStatus.SCHEDULED,
      EmailStatus.PROCESSING,
    );

    if (!claimed) {
      console.warn(`[worker] ⚠️ Email ${emailId} could not be claimed atomically. Skipping.`);
      return { status: 'skipped', reason: 'claim_failed' };
    }
    console.log(`[worker] 🔒 Email ${emailId} claimed atomically (SCHEDULED -> PROCESSING)`);
  }

  // 7. Send Email via Nodemailer SMTP
  try {
    const transporter = getSmtpTransporter();

    const senderEmail = email.sender?.email || 'noreply@mailflow.local';
    const senderName = email.sender?.name || 'MailFlow Sender';
    const fromAddress = `"${senderName}" <${senderEmail}>`;

    console.log(`[worker] ✉️ Sending email ${emailId} to ${email.recipientEmail}...`);

    const info = await transporter.sendMail({
      from: fromAddress,
      to: email.recipientEmail,
      subject: email.subject,
      html: email.body,
      text: email.body.replace(/<[^>]*>?/gm, ''), // Fallback plain text
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
    console.log(
      `[worker] ✅ SMTP accepted message ${info.messageId} for email ${emailId}. Preview URL: ${previewUrl || 'N/A'}`,
    );

    // 8. Update PostgreSQL state: PROCESSING -> SENT
    await emailRepository.updateStatusAtomic(
      emailId,
      EmailStatus.PROCESSING,
      EmailStatus.SENT,
      { sentAt: new Date() },
    );

    return {
      status: 'sent',
      messageId: info.messageId,
      recipient: email.recipientEmail,
      previewUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const sanitizedError = errorMessage.replace(/(pass|password|secret|auth|key)=[^&\s]+/gi, '$1=***');

    const isFinalAttempt = currentAttempt >= maxAttempts;

    if (isFinalAttempt) {
      console.error(
        `[worker] 💀 Email ${emailId} failed final attempt (${currentAttempt}/${maxAttempts}). Marking as FAILED. Error: ${sanitizedError}`,
      );

      // Transition to FAILED in PostgreSQL on final retry failure
      await emailRepository.updateStatusAtomic(
        emailId,
        EmailStatus.PROCESSING,
        EmailStatus.FAILED,
        {
          lastError: sanitizedError,
          incrementAttempts: true,
        },
      );
    } else {
      console.warn(
        `[worker] 🔄 SMTP delivery failed for email ${emailId} (Attempt ${currentAttempt}/${maxAttempts}). Reverting to SCHEDULED for BullMQ retry... Error: ${sanitizedError}`,
      );

      // Revert status from PROCESSING to SCHEDULED so next BullMQ retry can claim it atomically
      await emailRepository.updateStatusAtomic(
        emailId,
        EmailStatus.PROCESSING,
        EmailStatus.SCHEDULED,
        {
          lastError: sanitizedError,
          incrementAttempts: true,
        },
      );
    }

    // Re-throw error so BullMQ handles configured retries / fails job
    throw new Error(`SMTP sending failed: ${sanitizedError}`);
  }
}

/**
 * Initializes and starts the BullMQ Worker instance.
 */
export function getEmailWorker(): Worker<EmailJobPayload> {
  if (!emailWorkerInstance) {
    const concurrency = env.WORKER_CONCURRENCY || 5;

    emailWorkerInstance = new Worker<EmailJobPayload>(EMAIL_QUEUE_NAME, processEmailJob, {
      connection: redisOptions as any,
      concurrency,
      lockDuration: 30000,    // 30 seconds lock duration for active job processing
      stalledInterval: 30000, // Check for stalled jobs every 30 seconds
      maxStalledCount: 2,     // Recover stalled jobs up to 2 times before failing
    });

    emailWorkerInstance.on('completed', (job, result) => {
      console.log(`[worker] 🎉 Job ${job.id} completed successfully!`, result);
    });

    emailWorkerInstance.on('failed', (job, err) => {
      console.error(`[worker] 💥 Job ${job?.id || 'unknown'} failed: ${err.message}`);
    });

    emailWorkerInstance.on('error', (err) => {
      console.error('[worker] Worker instance error:', err.message);
    });

    console.log(
      `[worker] 🚀 Email worker initialized (concurrency=${concurrency}, maxPerHour=${env.MAX_EMAILS_PER_HOUR}, minDelayMs=${env.MIN_EMAIL_DELAY_MS})`,
    );
  }

  return emailWorkerInstance;
}

/**
 * Gracefully closes the BullMQ Worker instance.
 */
export async function closeEmailWorker(): Promise<void> {
  if (emailWorkerInstance) {
    console.log('[worker] Closing BullMQ email worker...');
    await emailWorkerInstance.close();
    emailWorkerInstance = null;
    console.log('[worker] Email worker closed cleanly.');
  }
}
