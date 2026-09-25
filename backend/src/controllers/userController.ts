import { Request, Response } from 'express';
import { userService } from '../services/userService.js';
import { ApiResponse } from '../types/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getCurrentUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = await userService.getUserById(req.userId!);
  const body: ApiResponse = {
    success: true,
    data: user,
  };
  res.status(200).json(body);
});

export const getUserById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const user = await userService.getUserById(id);
  const body: ApiResponse = {
    success: true,
    data: user,
  };
  res.status(200).json(body);
});
