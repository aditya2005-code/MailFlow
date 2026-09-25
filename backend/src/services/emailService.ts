import { Email, EmailStatus, CampaignStatus } from '@prisma/client';
import {
  emailRepository,
  CreateEmailData,
  ListEmailsOptions,
  PaginatedEmails,
} from '../repositories/emailRepository.js';
import { campaignService } from './campaignService.js';
import { prisma } from '../config/prisma.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors/appErrors.js';
import { z } from 'zod';

const emailAddressSchema = z.string().email();

export interface BulkCreateEmailItem {
  recipientEmail: string;
  recipientName?: string;
  subject?: string;
  body?: string;
  scheduledAt: Date;
}

export const emailService = {
  async createEmail(
    userId: string,
    campaignId: string,
    data: Omit<CreateEmailData, 'campaignId' | 'senderId'>,
  ): Promise<Email> {
    const campaign = await campaignService.getCampaignById(userId, campaignId);

    if (!emailAddressSchema.safeParse(data.recipientEmail).success) {
      throw new ValidationError(`Invalid recipient email address: '${data.recipientEmail}'.`);
    }

    if (!data.scheduledAt || isNaN(data.scheduledAt.getTime())) {
      throw new ValidationError('A valid scheduledAt date is required.');
    }

    return emailRepository.create({
      campaignId,
      senderId: campaign.senderId,
      recipientEmail: data.recipientEmail.toLowerCase(),
      recipientName: data.recipientName?.trim(),
      subject: data.subject?.trim() || campaign.subject,
      body: data.body || campaign.body,
      scheduledAt: data.scheduledAt,
      status: EmailStatus.SCHEDULED,
    });
  },

  /**
   * Bulk creates recipient emails for a campaign within a Prisma transaction.
   * Updates the campaign status to SCHEDULED atomically.
   */
  async bulkCreateEmails(
    userId: string,
    campaignId: string,
    items: BulkCreateEmailItem[],
  ): Promise<{ count: number }> {
    if (!items || items.length === 0) {
      throw new ValidationError('At least one email recipient is required for bulk creation.');
    }

    const campaign = await campaignService.getCampaignById(userId, campaignId);

    // Validate all items
    for (const [index, item] of items.entries()) {
      if (!emailAddressSchema.safeParse(item.recipientEmail).success) {
        throw new ValidationError(
          `Item at index ${index} has an invalid email: '${item.recipientEmail}'.`,
        );
      }
      if (!item.scheduledAt || isNaN(new Date(item.scheduledAt).getTime())) {
        throw new ValidationError(`Item at index ${index} has an invalid scheduledAt date.`);
      }
    }

    const emailRecords: CreateEmailData[] = items.map((item) => ({
      campaignId,
      senderId: campaign.senderId,
      recipientEmail: item.recipientEmail.toLowerCase(),
      recipientName: item.recipientName?.trim(),
      subject: item.subject?.trim() || campaign.subject,
      body: item.body || campaign.body,
      scheduledAt: new Date(item.scheduledAt),
      status: EmailStatus.SCHEDULED,
    }));

    // Transactionally create emails and mark campaign as SCHEDULED
    return prisma.$transaction(async (tx) => {
      const batchPayload = await emailRepository.createMany(emailRecords, tx);

      await tx.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.SCHEDULED },
      });

      return { count: batchPayload.count };
    });
  },

  async getEmailsByCampaign(
    userId: string,
    campaignId: string,
    options: ListEmailsOptions = {},
  ): Promise<PaginatedEmails> {
    await campaignService.getCampaignById(userId, campaignId); // Enforce campaign ownership
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

    // Verify user ownership through parent campaign
    await campaignService.getCampaignById(userId, email.campaignId);

    return email;
  },

  /**
   * Safe worker claim transition: SCHEDULED -> PROCESSING
   * Returns true if claimed successfully by this worker, false if already claimed/cancelled.
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
