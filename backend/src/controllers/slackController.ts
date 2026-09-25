import { Request, Response } from 'express';
import { slackConnectionService } from '../services/slackConnectionService.js';
import { ApiResponse } from '../types/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getSlackConnections = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const connections = await slackConnectionService.getConnectionByUser(req.userId!);
  const body: ApiResponse = {
    success: true,
    data: connections,
  };
  res.status(200).json(body);
});

export const createOrUpdateSlackConnection = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const connection = await slackConnectionService.createOrUpdateConnection(req.userId!, req.body);
    const body: ApiResponse = {
      success: true,
      data: connection,
    };
    res.status(200).json(body);
  },
);

export const deleteSlackConnection = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const connection = await slackConnectionService.deleteConnection(req.userId!, id);
    const body: ApiResponse = {
      success: true,
      data: connection,
      message: 'Slack connection removed successfully',
    };
    res.status(200).json(body);
  },
);
