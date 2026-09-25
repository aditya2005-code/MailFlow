import { Email, EmailStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export interface CreateEmailData {
  campaignId: string;
  senderId: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  body: string;
  scheduledAt: Date;
  status?: EmailStatus;
}

export interface ListEmailsOptions {
  page?: number;
  limit?: number;
  status?: EmailStatus;
}

export interface PaginatedEmails {
  emails: Email[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const emailRepository = {
  async findById(id: string): Promise<Email | null> {
    return prisma.email.findUnique({
      where: { id },
    });
  },

  async findByCampaignId(
    campaignId: string,
    userId: string,
    options: ListEmailsOptions = {},
  ): Promise<PaginatedEmails> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.EmailWhereInput = {
      campaignId,
      campaign: {
        userId, // Enforce campaign ownership
      },
      ...(options.status ? { status: options.status } : {}),
    };

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.email.count({ where }),
    ]);

    return {
      emails,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async findByUserId(userId: string, options: ListEmailsOptions = {}): Promise<PaginatedEmails> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.EmailWhereInput = {
      campaign: {
        userId,
      },
      ...(options.status ? { status: options.status } : {}),
    };

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'asc' },
      }),
      prisma.email.count({ where }),
    ]);

    return {
      emails,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async create(data: CreateEmailData): Promise<Email> {
    return prisma.email.create({
      data: {
        campaignId: data.campaignId,
        senderId: data.senderId,
        recipientEmail: data.recipientEmail,
        recipientName: data.recipientName ?? null,
        subject: data.subject,
        body: data.body,
        scheduledAt: data.scheduledAt,
        status: data.status ?? EmailStatus.SCHEDULED,
      },
    });
  },

  async createMany(
    data: CreateEmailData[],
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.BatchPayload> {
    const db = tx ?? prisma;
    return db.email.createMany({
      data: data.map((item) => ({
        campaignId: item.campaignId,
        senderId: item.senderId,
        recipientEmail: item.recipientEmail,
        recipientName: item.recipientName ?? null,
        subject: item.subject,
        body: item.body,
        scheduledAt: item.scheduledAt,
        status: item.status ?? EmailStatus.SCHEDULED,
      })),
    });
  },

  async update(id: string, data: Prisma.EmailUpdateInput): Promise<Email> {
    return prisma.email.update({
      where: { id },
      data,
    });
  },

  /**
   * Atomic status transition helper.
   *
   * Executes a conditional update:
   * UPDATE emails SET status = newStatus, ... WHERE id = id AND status = currentStatus
   *
   * Returns true if the state was transitioned by this call, false if another process claimed/transitioned it.
   */
  async updateStatusAtomic(
    id: string,
    currentStatus: EmailStatus,
    newStatus: EmailStatus,
    extra?: {
      sentAt?: Date;
      lastError?: string;
      incrementAttempts?: boolean;
    },
  ): Promise<boolean> {
    const updateData: Prisma.EmailUpdateInput = {
      status: newStatus,
      ...(extra?.sentAt ? { sentAt: extra.sentAt } : {}),
      ...(extra?.lastError ? { lastError: extra.lastError } : {}),
      ...(extra?.incrementAttempts ? { attempts: { increment: 1 } } : {}),
    };

    const result = await prisma.email.updateMany({
      where: {
        id,
        status: currentStatus,
      },
      data: updateData,
    });

    return result.count > 0;
  },

  /**
   * Efficiently finds emails due for processing ordered by scheduledAt ASC.
   * Leverages the (status, scheduledAt) composite database index.
   */
  async findScheduledEmails(batchSize = 50, beforeTime: Date = new Date()): Promise<Email[]> {
    return prisma.email.findMany({
      where: {
        status: EmailStatus.SCHEDULED,
        scheduledAt: {
          lte: beforeTime,
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
      take: batchSize,
    });
  },
};
