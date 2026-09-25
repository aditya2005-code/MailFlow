import { SlackConnection } from '@prisma/client';
import {
  slackConnectionRepository,
  CreateSlackConnectionData,
  UpdateSlackConnectionData,
} from '../repositories/slackConnectionRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors/appErrors.js';
import { z } from 'zod';

const webhookUrlSchema = z.string().url();

export const slackConnectionService = {
  async createOrUpdateConnection(
    userId: string,
    data: Omit<CreateSlackConnectionData, 'userId'>,
  ): Promise<SlackConnection> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError(`User with ID '${userId}' not found.`);
    }

    if (!data.teamId || data.teamId.trim() === '') {
      throw new ValidationError('Slack teamId is required.');
    }

    if (!webhookUrlSchema.safeParse(data.webhookUrl).success) {
      throw new ValidationError('Invalid Slack webhook URL format.');
    }

    const existing = await slackConnectionRepository.findByUserAndTeam(userId, data.teamId);

    if (existing) {
      return slackConnectionRepository.update(existing.id, userId, {
        teamName: data.teamName,
        webhookUrl: data.webhookUrl,
      });
    }

    return slackConnectionRepository.create({
      userId,
      teamId: data.teamId,
      teamName: data.teamName,
      webhookUrl: data.webhookUrl,
    });
  },

  async getConnectionByUser(userId: string): Promise<SlackConnection[]> {
    return slackConnectionRepository.findByUserId(userId);
  },

  async getConnectionById(userId: string, connectionId: string): Promise<SlackConnection> {
    const connection = await slackConnectionRepository.findById(connectionId);
    if (!connection) {
      throw new NotFoundError(`Slack connection with ID '${connectionId}' not found.`);
    }

    if (connection.userId !== userId) {
      throw new ForbiddenError('You do not have permission to access this Slack connection.');
    }

    return connection;
  },

  async updateConnection(
    userId: string,
    connectionId: string,
    data: UpdateSlackConnectionData,
  ): Promise<SlackConnection> {
    await this.getConnectionById(userId, connectionId); // Enforce ownership

    if (data.webhookUrl && !webhookUrlSchema.safeParse(data.webhookUrl).success) {
      throw new ValidationError('Invalid Slack webhook URL format.');
    }

    return slackConnectionRepository.update(connectionId, userId, data);
  },

  async deleteConnection(userId: string, connectionId: string): Promise<SlackConnection> {
    await this.getConnectionById(userId, connectionId); // Enforce ownership
    return slackConnectionRepository.delete(connectionId, userId);
  },
};
