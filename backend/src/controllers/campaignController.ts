import { Request, Response } from 'express';
import { campaignService } from '../services/campaignService.js';
import { ApiResponse } from '../types/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { CampaignStatus } from '@prisma/client';

export const getCampaigns = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const status = req.query.status as CampaignStatus | undefined;

  const result = await campaignService.getCampaignsByUser(req.userId!, {
    page,
    limit,
    status,
  });

  const body: ApiResponse = {
    success: true,
    data: result.campaigns,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  };
  res.status(200).json(body);
});

export const getCampaignById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const campaign = await campaignService.getCampaignById(req.userId!, id);
  const body: ApiResponse = {
    success: true,
    data: campaign,
  };
  res.status(200).json(body);
});

export const createCampaign = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const campaign = await campaignService.createCampaign(req.userId!, req.body);
  const body: ApiResponse = {
    success: true,
    data: campaign,
  };
  res.status(201).json(body);
});

export const updateCampaign = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const campaign = await campaignService.updateCampaign(req.userId!, id, req.body);
  const body: ApiResponse = {
    success: true,
    data: campaign,
  };
  res.status(200).json(body);
});

export const deleteCampaign = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const campaign = await campaignService.deleteCampaign(req.userId!, id);
  const body: ApiResponse = {
    success: true,
    data: campaign,
    message: 'Campaign deleted successfully',
  };
  res.status(200).json(body);
});
