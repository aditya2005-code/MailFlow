import { Request, Response } from 'express';
import { senderService } from '../services/senderService.js';
import { ApiResponse } from '../types/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getSenders = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const senders = await senderService.getSendersByUser(req.userId!);
  const body: ApiResponse = {
    success: true,
    data: senders,
  };
  res.status(200).json(body);
});

export const getSenderById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const sender = await senderService.getSenderById(req.userId!, id);
  const body: ApiResponse = {
    success: true,
    data: sender,
  };
  res.status(200).json(body);
});

export const createSender = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const sender = await senderService.createSender(req.userId!, req.body);
  const body: ApiResponse = {
    success: true,
    data: sender,
  };
  res.status(201).json(body);
});

export const updateSender = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const sender = await senderService.updateSender(req.userId!, id, req.body);
  const body: ApiResponse = {
    success: true,
    data: sender,
  };
  res.status(200).json(body);
});

export const deleteSender = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const sender = await senderService.deleteSender(req.userId!, id);
  const body: ApiResponse = {
    success: true,
    data: sender,
    message: 'Sender identity deleted successfully',
  };
  res.status(200).json(body);
});
