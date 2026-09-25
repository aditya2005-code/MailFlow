import { Campaign, CampaignStatus } from '@prisma/client';
import {
  campaignRepository,
  CreateCampaignData,
  UpdateCampaignData,
  ListCampaignsOptions,
  PaginatedCampaigns,
  CampaignStats,
} from '../repositories/campaignRepository.js';
import { senderService } from './senderService.js';
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from '../errors/appErrors.js';

export interface CampaignWithStats extends Campaign {
  sender?: { id: string; name: string; email: string };
  stats: CampaignStats;
}

export const campaignService = {
  async createCampaign(
    userId: string,
    data: Omit<CreateCampaignData, 'userId'>,
  ): Promise<Campaign> {
    if (!data.name || data.name.trim() === '') {
      throw new ValidationError('Campaign name is required.');
    }

    if (!data.subject || data.subject.trim() === '') {
      throw new ValidationError('Campaign subject is required.');
    }

    if (!data.body || data.body.trim() === '') {
      throw new ValidationError('Campaign email body is required.');
    }

    // Enforce that sender belongs to the authenticated user
    await senderService.getSenderById(userId, data.senderId);

    // Newly created campaigns ALWAYS start in DRAFT status
    return campaignRepository.create({
      userId,
      senderId: data.senderId,
      name: data.name.trim(),
      subject: data.subject.trim(),
      body: data.body,
      status: CampaignStatus.DRAFT,
    });
  },

  async getCampaignsByUser(
    userId: string,
    options: ListCampaignsOptions = {},
  ): Promise<PaginatedCampaigns> {
    return campaignRepository.findByUserId(userId, options);
  },

  async getCampaignById(userId: string, campaignId: string): Promise<CampaignWithStats> {
    const campaign = await campaignRepository.findById(campaignId);
    if (!campaign) {
      throw new NotFoundError(`Campaign with ID '${campaignId}' not found.`);
    }

    if (campaign.userId !== userId) {
      throw new ForbiddenError('You do not have permission to access this campaign.');
    }

    const stats = await campaignRepository.getCampaignStats(campaignId);

    return {
      ...campaign,
      stats,
    };
  },

  async updateCampaign(
    userId: string,
    campaignId: string,
    data: UpdateCampaignData,
  ): Promise<Campaign> {
    const existing = await this.getCampaignById(userId, campaignId);

    if (existing.status === CampaignStatus.COMPLETED || existing.status === CampaignStatus.FAILED) {
      throw new ConflictError(
        `Cannot edit a campaign that is already in '${existing.status}' status.`,
      );
    }

    if (data.senderId && data.senderId !== existing.senderId) {
      await senderService.getSenderById(userId, data.senderId);
    }

    // Clients cannot manually force status to COMPLETED or FAILED via public API
    if (data.status && (data.status === CampaignStatus.COMPLETED || data.status === CampaignStatus.FAILED)) {
      throw new ForbiddenError('Campaign completion and failure states are managed automatically by the worker process.');
    }

    return campaignRepository.update(campaignId, userId, data);
  },

  async deleteCampaign(userId: string, campaignId: string): Promise<Campaign> {
    const existing = await this.getCampaignById(userId, campaignId);

    if (existing.stats.processingCount > 0) {
      throw new ConflictError('Cannot delete a campaign that currently has emails being processed.');
    }

    return campaignRepository.delete(campaignId, userId);
  },
};
