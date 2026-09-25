import { z } from 'zod';
import { EmailStatus } from '@prisma/client';

export const MAX_BULK_EMAIL_BATCH_SIZE = 500;

export const createEmailSchema = z.object({
  campaignId: z.string().min(1, 'Campaign ID is required'),
  recipientEmail: z.string().email('Valid recipient email address is required'),
  recipientName: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  scheduledAt: z.coerce.date({ message: 'Valid scheduledAt timestamp is required' }).optional(),
});

export const bulkCreateEmailSchema = z.object({
  campaignId: z.string().min(1, 'Campaign ID is required'),
  items: z
    .array(
      z.object({
        recipientEmail: z.string().email('Valid recipient email address is required'),
        recipientName: z.string().optional(),
        subject: z.string().optional(),
        body: z.string().optional(),
        scheduledAt: z.coerce.date({ message: 'Valid scheduledAt timestamp is required' }).optional(),
      }),
    )
    .min(1, 'At least one recipient email item is required')
    .max(
      MAX_BULK_EMAIL_BATCH_SIZE,
      `Maximum batch size exceeded. Maximum allowed recipients per request is ${MAX_BULK_EMAIL_BATCH_SIZE}.`,
    ),
});

export const listEmailsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.nativeEnum(EmailStatus).optional(),
  campaignId: z.string().min(1).optional(),
  senderId: z.string().min(1).optional(),
  recipientEmail: z.string().min(1).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  sortBy: z.enum(['scheduledAt', 'createdAt', 'status', 'recipientEmail']).optional().default('scheduledAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

export const rescheduleEmailSchema = z.object({
  scheduledAt: z.coerce.date({ message: 'Valid ISO scheduledAt timestamp is required' }),
});

export const searchEmailsQuerySchema = z.object({
  q: z.string().optional(),
  status: z.nativeEnum(EmailStatus).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});
