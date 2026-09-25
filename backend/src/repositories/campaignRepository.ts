import { Campaign, CampaignStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export interface CreateCampaignData {
  userId: string;
  senderId: string;
  name: string;
  subject: string;
  body: string;
  status?: CampaignStatus;
}

export interface UpdateCampaignData {
  name?: string;
  subject?: string;
  body?: string;
  senderId?: string;
  status?: CampaignStatus;
}

export interface ListCampaignsOptions {
  page?: number;
  limit?: number;
  status?: CampaignStatus;
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface CampaignStats {
  totalEmails: number;
  scheduledCount: number;
  processingCount: number;
  sentCount: number;
  failedCount: number;
}

export interface PaginatedCampaigns {
  campaigns: (Campaign & { sender?: { id: string; name: string; email: string }; _count?: { emails: number } })[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const campaignRepository = {
  async findById(id: string, userId?: string) {
    return prisma.campaign.findFirst({
      where: {
        id,
        ...(userId ? { userId } : {}),
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            emails: true,
          },
        },
      },
    });
  },

  async getCampaignStats(campaignId: string): Promise<CampaignStats> {
    const counts = await prisma.email.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { id: true },
    });

    const stats: CampaignStats = {
      totalEmails: 0,
      scheduledCount: 0,
      processingCount: 0,
      sentCount: 0,
      failedCount: 0,
    };

    for (const group of counts) {
      const count = group._count.id;
      stats.totalEmails += count;
      if (group.status === 'SCHEDULED') stats.scheduledCount = count;
      else if (group.status === 'PROCESSING') stats.processingCount = count;
      else if (group.status === 'SENT') stats.sentCount = count;
      else if (group.status === 'FAILED') stats.failedCount = count;
    }

    return stats;
  },

  async findByUserId(userId: string, options: ListCampaignsOptions = {}): Promise<PaginatedCampaigns> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const allowedSortFields = ['createdAt', 'updatedAt', 'name', 'status'];
    const sortBy = allowedSortFields.includes(options.sortBy || '') ? options.sortBy! : 'createdAt';
    const sortOrder: Prisma.SortOrder = options.sortOrder === 'asc' ? 'asc' : 'desc';

    const where: Prisma.CampaignWhereInput = {
      userId,
      ...(options.status ? { status: options.status } : {}),
    };

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              emails: true,
            },
          },
        },
      }),
      prisma.campaign.count({ where }),
    ]);

    return {
      campaigns,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async create(data: CreateCampaignData): Promise<Campaign> {
    return prisma.campaign.create({
      data: {
        userId: data.userId,
        senderId: data.senderId,
        name: data.name,
        subject: data.subject,
        body: data.body,
        status: data.status ?? CampaignStatus.DRAFT,
      },
    });
  },

  async update(id: string, userId: string, data: UpdateCampaignData): Promise<Campaign> {
    return prisma.campaign.update({
      where: { id, userId },
      data,
    });
  },

  async delete(id: string, userId: string): Promise<Campaign> {
    return prisma.campaign.delete({
      where: { id, userId },
    });
  },
};
