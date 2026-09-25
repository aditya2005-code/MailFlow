import { Email, EmailStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export interface CreateEmailData {
  campaignId: string;
  senderId: string;
  recipientEmail: string;
  recipientName?: string;
  subject?: string;
  body?: string;
  scheduledAt: Date;
  status?: EmailStatus;
}

export interface ListEmailsOptions {
  page?: number;
  limit?: number;
  status?: EmailStatus;
  campaignId?: string;
  senderId?: string;
  recipientEmail?: string;
  startDate?: Date;
  endDate?: Date;
  sortBy?: 'scheduledAt' | 'createdAt' | 'status' | 'recipientEmail';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedEmails {
  emails: (Email & {
    campaign?: { id: string; name: string; subject: string };
    sender?: { id: string; name: string; email: string };
  })[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const emailRepository = {
  async findById(id: string): Promise<
    | (Email & {
        campaign?: { id: string; name: string; subject: string; userId: string };
        sender?: { id: string; name: string; email: string };
      })
    | null
  > {
    return prisma.email.findUnique({
      where: { id },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            subject: true,
            userId: true,
          },
        },
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  },

  async findByCampaignId(
    campaignId: string,
    userId: string,
    options: ListEmailsOptions = {},
  ): Promise<PaginatedEmails> {
    return this.findByUserId(userId, { ...options, campaignId });
  },

  async findByUserId(userId: string, options: ListEmailsOptions = {}): Promise<PaginatedEmails> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const allowedSortFields = ['scheduledAt', 'createdAt', 'status', 'recipientEmail'];
    const sortBy = allowedSortFields.includes(options.sortBy || '') ? options.sortBy! : 'scheduledAt';
    const sortOrder: Prisma.SortOrder = options.sortOrder === 'desc' ? 'desc' : 'asc';

    const where: Prisma.EmailWhereInput = {
      campaign: {
        userId,
      },
      ...(options.status ? { status: options.status } : {}),
      ...(options.campaignId ? { campaignId: options.campaignId } : {}),
      ...(options.senderId ? { senderId: options.senderId } : {}),
      ...(options.recipientEmail
        ? { recipientEmail: { contains: options.recipientEmail.toLowerCase(), mode: 'insensitive' } }
        : {}),
      ...(options.startDate || options.endDate
        ? {
            scheduledAt: {
              ...(options.startDate ? { gte: options.startDate } : {}),
              ...(options.endDate ? { lte: options.endDate } : {}),
            },
          }
        : {}),
    };

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              subject: true,
            },
          },
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.email.count({ where }),
    ]);

    return {
      emails,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async create(data: CreateEmailData): Promise<Email> {
    return prisma.email.create({
      data: {
        campaignId: data.campaignId,
        senderId: data.senderId,
        recipientEmail: data.recipientEmail,
        recipientName: data.recipientName ?? null,
        subject: data.subject ?? '',
        body: data.body ?? '',
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
        subject: item.subject ?? '',
        body: item.body ?? '',
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
