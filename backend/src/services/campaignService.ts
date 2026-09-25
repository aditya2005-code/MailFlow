import { Campaign, CampaignStatus } from '@prisma/client';
import {
  campaignRepository,
  CreateCampaignData,
  UpdateCampaignData,
  ListCampaignsOptions,
  PaginatedCampaigns,
} from '../repositories/campaignRepository.js';
import { senderService } from './senderService.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors/appErrors.js';

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

    // Enforce that sender belongs to the user
    await senderService.getSenderById(userId, data.senderId);

    return campaignRepository.create({
      userId,
      senderId: data.senderId,
      name: data.name.trim(),
      subject: data.subject.trim(),
      body: data.body,
      status: data.status ?? CampaignStatus.DRAFT,
    });
  },

  async getCampaignsByUser(
    userId: string,
    options: ListCampaignsOptions = {},
  ): Promise<PaginatedCampaigns> {
    return campaignRepository.findByUserId(userId, options);
  },

  async getCampaignById(userId: string, campaignId: string) {
    const campaign = await campaignRepository.findById(campaignId);
    if (!campaign) {
      throw new NotFoundError(`Campaign with ID '${campaignId}' not found.`);
    }

    if (campaign.userId !== userId) {
      throw new ForbiddenError('You do not have permission to access this campaign.');
    }

    return campaign;
  },

  async updateCampaign(
    userId: string,
    campaignId: string,
    data: UpdateCampaignData,
  ): Promise<Campaign> {
    const existing = await this.getCampaignById(userId, campaignId);

    if (data.senderId && data.senderId !== existing.senderId) {
      await senderService.getSenderById(userId, data.senderId);
    }

    return campaignRepository.update(campaignId, userId, data);
  },

  async deleteCampaign(userId: string, campaignId: string): Promise<Campaign> {
    await this.getCampaignById(userId, campaignId); // Enforce ownership
    return campaignRepository.delete(campaignId, userId);
  },
};
