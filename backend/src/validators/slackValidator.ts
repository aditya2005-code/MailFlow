import { z } from 'zod';

export const createSlackConnectionSchema = z.object({
  teamId: z.string().min(1, 'Slack teamId is required'),
  teamName: z.string().optional(),
  webhookUrl: z.string().url('Valid Slack webhook URL is required'),
});
