import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { EmailStatus } from '@prisma/client';
import { EMAIL_QUEUE_NAME, EmailJobPayload } from '../queues/index.js';
import { redisOptions } from '../config/redis.js';
import { env } from '../config/env.js';
import { emailRepository } from '../repositories/emailRepository.js';
import { getSmtpTransporter } from '../config/smtp.js';

let emailWorkerInstance: Worker<EmailJobPayload> | null = null;

/**
 * Core processor for email sending jobs.
 *
 * Implements strict atomic status claim (SCHEDULED -> PROCESSING) to prevent double-sending
 * in multi-worker environments, delivers email via Nodemailer Ethereal SMTP, and updates PostgreSQL
 * to SENT status with current UTC timestamp.
 */
export async function processEmailJob(job: Job<EmailJobPayload>): Promise<any> {
  const { emailId } = job.data;
  console.log(`[worker] Processing job ${job.id} for emailId: ${emailId}`);

  // 1. Retrieve Email record from PostgreSQL (source of truth)
  const email = await emailRepository.findById(emailId);

  if (!email) {
    const errorMsg = `Email record with ID '${emailId}' not found in database.`;
    console.error(`[worker] ❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // 2. Idempotency Check — Skip if already sent
  if (email.status === EmailStatus.SENT) {
    console.log(`[worker] ℹ️ Email ${emailId} is already marked SENT. Skipping duplicate execution.`);
    return { status: 'skipped', reason: 'already_sent' };
  }

  // 3. Status Handling & Atomic Claim — Transition SCHEDULED -> PROCESSING
  if (email.status === EmailStatus.PROCESSING) {
    console.warn(`[worker] ⚠️ Email ${emailId} is currently being processed by another worker. Skipping.`);
    return { status: 'skipped', reason: 'already_processing' };
  }

  if (email.status !== EmailStatus.SCHEDULED) {
    console.warn(`[worker] ⚠️ Email ${emailId} has status '${email.status}', which is not SCHEDULED. Skipping.`);
    return { status: 'skipped', reason: 'invalid_status' };
  }

  const claimed = await emailRepository.updateStatusAtomic(
    emailId,
    EmailStatus.SCHEDULED,
    EmailStatus.PROCESSING,
  );

  if (!claimed) {
    console.warn(`[worker] ⚠️ Email ${emailId} could not be claimed (already claimed by another worker). Skipping.`);
    return { status: 'skipped', reason: 'claim_failed' };
  }

  // 4. Send Email via Nodemailer Ethereal SMTP
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
    console.log(`[worker] ✅ SMTP accepted message ${info.messageId}. Preview URL: ${previewUrl || 'N/A'}`);

    // 5. Update PostgreSQL state: PROCESSING -> SENT
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
    const sanitizedError = errorMessage.replace(/(pass|password|secret|auth)=[^&\s]+/gi, '$1=***');

    console.error(`[worker] ❌ SMTP sending failed for email ${emailId}: ${sanitizedError}`);

    // Record error in PostgreSQL database
    await emailRepository.updateStatusAtomic(
      emailId,
      EmailStatus.PROCESSING,
      EmailStatus.FAILED,
      {
        lastError: sanitizedError,
        incrementAttempts: true,
      },
    );

    // Re-throw error so BullMQ handles configured retries
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
    });

    emailWorkerInstance.on('completed', (job, result) => {
      console.log(`[worker] 🎉 Job ${job.id} completed!`, result);
    });

    emailWorkerInstance.on('failed', (job, err) => {
      console.error(`[worker] 💥 Job ${job?.id || 'unknown'} failed: ${err.message}`);
    });

    emailWorkerInstance.on('error', (err) => {
      console.error('[worker] Worker instance error:', err.message);
    });

    console.log(`[worker] 🚀 Email worker initialized with concurrency=${concurrency}`);
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
