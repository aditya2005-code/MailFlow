import { Request, Response } from 'express';
import { emailService } from '../services/emailService.js';
import { ApiResponse } from '../types/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { EmailStatus } from '@prisma/client';

export const getEmails = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const status = req.query.status as EmailStatus | undefined;

  const result = await emailService.getEmailsByUser(req.userId!, {
    page,
    limit,
    status,
  });

  const body: ApiResponse = {
    success: true,
    data: result.emails,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  };
  res.status(200).json(body);
});

export const getEmailById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const email = await emailService.getEmailById(req.userId!, id);
  const body: ApiResponse = {
    success: true,
    data: email,
  };
  res.status(200).json(body);
});

export const createEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { campaignId, ...emailData } = req.body;
  const email = await emailService.createEmail(req.userId!, campaignId, emailData);
  const body: ApiResponse = {
    success: true,
    data: email,
  };
  res.status(201).json(body);
});

export const bulkCreateEmails = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { campaignId, items } = req.body;
  const result = await emailService.bulkCreateEmails(req.userId!, campaignId, items);
  const body: ApiResponse = {
    success: true,
    data: result,
    message: `Successfully created ${result.count} email record(s)`,
  };
  res.status(201).json(body);
});
