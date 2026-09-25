import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.string().min(1, 'ID route parameter is required'),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.string().optional(),
});
