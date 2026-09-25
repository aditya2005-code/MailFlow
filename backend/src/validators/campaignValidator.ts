import { z } from 'zod';
import { CampaignStatus } from '@prisma/client';

export const createCampaignSchema = z.object({
  senderId: z.string().min(1, 'Sender ID is required'),
  name: z.string().min(1, 'Campaign name is required'),
  subject: z.string().min(1, 'Campaign subject is required'),
  body: z.string().min(1, 'Campaign body is required'),
  status: z.nativeEnum(CampaignStatus).optional(),
});

export const updateCampaignSchema = z.object({
  senderId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  status: z.nativeEnum(CampaignStatus).optional(),
});
