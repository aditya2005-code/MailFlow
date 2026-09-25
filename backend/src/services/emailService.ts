import { Email, EmailStatus, CampaignStatus } from '@prisma/client';
import {
  emailRepository,
  CreateEmailData,
  ListEmailsOptions,
  PaginatedEmails,
} from '../repositories/emailRepository.js';
import { campaignService } from './campaignService.js';
import { prisma } from '../config/prisma.js';
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from '../errors/appErrors.js';
import { z } from 'zod';
import { MAX_BULK_EMAIL_BATCH_SIZE } from '../validators/emailValidator.js';
import { addEmailJob, removeEmailJob } from '../queues/index.js';

const emailAddressSchema = z.string().email();

export interface BulkCreateEmailItem {
  recipientEmail: string;
  recipientName?: string;
  subject?: string;
  body?: string;
  scheduledAt?: Date;
}

export interface BulkCreateResult {
  count: number;
  duplicatesSkipped: number;
}

export const emailService = {
  async createEmail(
    userId: string,
    campaignId: string,
    data: Omit<CreateEmailData, 'campaignId' | 'senderId'>,
  ): Promise<Email> {
    const campaign = await campaignService.getCampaignById(userId, campaignId);

    if (!emailAddressSchema.safeParse(data.recipientEmail).success) {
      throw new ValidationError(`Invalid recipient email address format: '${data.recipientEmail}'.`);
    }

    const scheduledAtDate = data.scheduledAt ? new Date(data.scheduledAt) : new Date();
    if (isNaN(scheduledAtDate.getTime())) {
      throw new ValidationError('A valid scheduledAt date is required.');
    }

    const createdEmail = await emailRepository.create({
      campaignId,
      senderId: campaign.senderId,
      recipientEmail: data.recipientEmail.toLowerCase(),
      recipientName: data.recipientName?.trim(),
      subject: data.subject?.trim() || campaign.subject,
      body: data.body || campaign.body,
      scheduledAt: scheduledAtDate,
      status: EmailStatus.SCHEDULED,
    });

    // Enqueue corresponding BullMQ delayed job after DB record creation
    const delay = Math.max(0, scheduledAtDate.getTime() - Date.now());
    await addEmailJob(createdEmail.id, delay);

    return createdEmail;
  },

  /**
   * Bulk creates recipient email records for a campaign within a Prisma transaction.
   * Enforces a maximum batch limit of 500 per request, deduplicates within the batch,
   * updates the campaign status to SCHEDULED atomically, and enqueues BullMQ delayed jobs.
   */
  async bulkCreateEmails(
    userId: string,
    campaignId: string,
    items: BulkCreateEmailItem[],
  ): Promise<BulkCreateResult> {
    if (!items || items.length === 0) {
      throw new ValidationError('At least one email recipient is required for bulk creation.');
    }

    if (items.length > MAX_BULK_EMAIL_BATCH_SIZE) {
      throw new ValidationError(
        `Maximum batch size exceeded. Maximum allowed recipients per request is ${MAX_BULK_EMAIL_BATCH_SIZE}.`,
      );
    }

    const campaign = await campaignService.getCampaignById(userId, campaignId);

    // Validate all items
    for (const [index, item] of items.entries()) {
      if (!emailAddressSchema.safeParse(item.recipientEmail).success) {
        throw new ValidationError(
          `Item at index ${index} has an invalid email: '${item.recipientEmail}'.`,
        );
      }
      if (item.scheduledAt && isNaN(new Date(item.scheduledAt).getTime())) {
        throw new ValidationError(`Item at index ${index} has an invalid scheduledAt date.`);
      }
    }

    // Deduplicate recipient emails within the incoming batch (case-insensitive)
    const seenEmails = new Set<string>();
    const uniqueItems: BulkCreateEmailItem[] = [];
    let duplicatesSkipped = 0;

    for (const item of items) {
      const normalized = item.recipientEmail.toLowerCase();
      if (seenEmails.has(normalized)) {
        duplicatesSkipped++;
      } else {
        seenEmails.add(normalized);
        uniqueItems.push(item);
      }
    }

    const emailRecords: CreateEmailData[] = uniqueItems.map((item) => ({
      campaignId,
      senderId: campaign.senderId,
      recipientEmail: item.recipientEmail.toLowerCase(),
      recipientName: item.recipientName?.trim(),
      subject: item.subject?.trim() || campaign.subject,
      body: item.body || campaign.body,
      scheduledAt: item.scheduledAt ? new Date(item.scheduledAt) : new Date(),
      status: EmailStatus.SCHEDULED,
    }));

    // Transactionally create emails and set campaign status to SCHEDULED
    const result = await prisma.$transaction(async (tx) => {
      const batchPayload = await emailRepository.createMany(emailRecords, tx);

      await tx.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.SCHEDULED },
      });

      return {
        count: batchPayload.count,
        duplicatesSkipped,
      };
    });

    // Enqueue delayed BullMQ jobs for all created email records
    const createdEmails = await emailRepository.findByCampaignId(campaignId, userId, {
      limit: MAX_BULK_EMAIL_BATCH_SIZE,
    });

    await Promise.all(
      createdEmails.emails.map((emailItem) => {
        const delay = Math.max(0, new Date(emailItem.scheduledAt).getTime() - Date.now());
        return addEmailJob(emailItem.id, delay);
      }),
    );

    return result;
  },

  async getEmailsByCampaign(
    userId: string,
    campaignId: string,
    options: ListEmailsOptions = {},
  ): Promise<PaginatedEmails> {
    await campaignService.getCampaignById(userId, campaignId);
    return emailRepository.findByCampaignId(campaignId, userId, options);
  },

  async getEmailsByUser(
    userId: string,
    options: ListEmailsOptions = {},
  ): Promise<PaginatedEmails> {
    return emailRepository.findByUserId(userId, options);
  },

  async getEmailById(userId: string, emailId: string): Promise<Email> {
    const email = await emailRepository.findById(emailId);
    if (!email) {
      throw new NotFoundError(`Email with ID '${emailId}' not found.`);
    }

    if (!email.campaign || email.campaign.userId !== userId) {
      throw new ForbiddenError('You do not have permission to access this email record.');
    }

    return email;
  },

  /**
   * Prepares service layer for Phase 3 cancellation.
   * Cancels a scheduled email if it has not yet entered processing or sent status.
   */
  async cancelScheduledEmail(userId: string, emailId: string): Promise<Email> {
    const email = await this.getEmailById(userId, emailId);

    if (email.status !== EmailStatus.SCHEDULED) {
      throw new ConflictError(
        `Cannot cancel email because its current status is '${email.status}'. Only SCHEDULED emails can be cancelled.`,
      );
    }

    // Safely update DB record
    return emailRepository.update(emailId, {
      status: EmailStatus.FAILED,
      lastError: 'Cancelled by user prior to sending.',
    });
  },

  /**
   * Safe worker claim transition: SCHEDULED -> PROCESSING
   */
  async claimEmailForProcessing(emailId: string): Promise<boolean> {
    return emailRepository.updateStatusAtomic(
      emailId,
      EmailStatus.SCHEDULED,
      EmailStatus.PROCESSING,
    );
  },

  /**
   * Worker completion transition: PROCESSING -> SENT
   */
  async markEmailSent(emailId: string): Promise<boolean> {
    return emailRepository.updateStatusAtomic(
      emailId,
      EmailStatus.PROCESSING,
      EmailStatus.SENT,
      { sentAt: new Date() },
    );
  },

  /**
   * Worker error transition: PROCESSING -> FAILED
   */
  async markEmailFailed(emailId: string, errorMessage: string): Promise<boolean> {
    return emailRepository.updateStatusAtomic(
      emailId,
      EmailStatus.PROCESSING,
      EmailStatus.FAILED,
      {
        lastError: errorMessage,
        incrementAttempts: true,
      },
    );
  },
};
