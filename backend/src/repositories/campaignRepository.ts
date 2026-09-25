import { Campaign, CampaignStatus } from '@prisma/client';
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

  async findByUserId(userId: string, options: ListCampaignsOptions = {}): Promise<PaginatedCampaigns> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...(options.status ? { status: options.status } : {}),
    };

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
      totalPages: Math.ceil(total / limit),
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
