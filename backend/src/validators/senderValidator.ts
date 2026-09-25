import { z } from 'zod';

export const createSenderSchema = z.object({
  email: z.string().email('Valid email address is required'),
  name: z.string().min(1, 'Sender name is required'),
});

export const updateSenderSchema = z.object({
  email: z.string().email('Valid email address is required').optional(),
  name: z.string().min(1, 'Sender name cannot be empty').optional(),
});
