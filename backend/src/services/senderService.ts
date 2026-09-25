import { Sender } from '@prisma/client';
import { senderRepository, CreateSenderData, UpdateSenderData } from '../repositories/senderRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from '../errors/appErrors.js';
import { z } from 'zod';

const emailSchema = z.string().email();

export const senderService = {
  async createSender(userId: string, data: Omit<CreateSenderData, 'userId'>): Promise<Sender> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError(`User with ID '${userId}' not found.`);
    }

    if (!data.name || data.name.trim() === '') {
      throw new ValidationError('Sender name is required.');
    }

    if (!emailSchema.safeParse(data.email).success) {
      throw new ValidationError('Invalid sender email address format.');
    }

    const existing = await senderRepository.findByUserAndEmail(userId, data.email);
    if (existing) {
      throw new ConflictError(`Sender with email '${data.email}' already exists for this user.`);
    }

    return senderRepository.create({
      userId,
      email: data.email.toLowerCase(),
      name: data.name.trim(),
    });
  },

  async getSendersByUser(userId: string): Promise<Sender[]> {
    return senderRepository.findByUserId(userId);
  },

  async getSenderById(userId: string, senderId: string): Promise<Sender> {
    const sender = await senderRepository.findById(senderId);
    if (!sender) {
      throw new NotFoundError(`Sender with ID '${senderId}' not found.`);
    }

    if (sender.userId !== userId) {
      throw new ForbiddenError('You do not have permission to access this sender.');
    }

    return sender;
  },

  async updateSender(userId: string, senderId: string, data: UpdateSenderData): Promise<Sender> {
    const existing = await this.getSenderById(userId, senderId);

    if (data.email) {
      if (!emailSchema.safeParse(data.email).success) {
        throw new ValidationError('Invalid sender email address format.');
      }

      if (data.email.toLowerCase() !== existing.email.toLowerCase()) {
        const duplicate = await senderRepository.findByUserAndEmail(userId, data.email.toLowerCase());
        if (duplicate) {
          throw new ConflictError(`Sender with email '${data.email}' already exists for this user.`);
        }
      }
    }

    return senderRepository.update(senderId, userId, {
      ...(data.name ? { name: data.name.trim() } : {}),
      ...(data.email ? { email: data.email.toLowerCase() } : {}),
    });
  },

  async deleteSender(userId: string, senderId: string): Promise<Sender> {
    await this.getSenderById(userId, senderId); // Enforces existence and user ownership
    try {
      return await senderRepository.delete(senderId, userId);
    } catch (error: any) {
      if (error?.code === 'P2003') {
        throw new ConflictError(
          'Cannot delete sender identity because it is currently associated with existing campaigns or emails.',
        );
      }
      throw error;
    }
  },
};
