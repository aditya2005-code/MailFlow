import { z } from 'zod';

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
    .min(1, 'At least one recipient email item is required'),
});
