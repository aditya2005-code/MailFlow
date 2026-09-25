import { SlackConnection } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export interface CreateSlackConnectionData {
  userId: string;
  teamId: string;
  teamName?: string;
  webhookUrl: string;
}

export interface UpdateSlackConnectionData {
  teamName?: string;
  webhookUrl?: string;
}

export const slackConnectionRepository = {
  async findById(id: string, userId?: string): Promise<SlackConnection | null> {
    return prisma.slackConnection.findFirst({
      where: {
        id,
        ...(userId ? { userId } : {}),
      },
    });
  },

  async findByUserId(userId: string): Promise<SlackConnection[]> {
    return prisma.slackConnection.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async findByUserAndTeam(userId: string, teamId: string): Promise<SlackConnection | null> {
    return prisma.slackConnection.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId,
        },
      },
    });
  },

  async create(data: CreateSlackConnectionData): Promise<SlackConnection> {
    return prisma.slackConnection.create({
      data,
    });
  },

  async update(id: string, userId: string, data: UpdateSlackConnectionData): Promise<SlackConnection> {
    return prisma.slackConnection.update({
      where: { id, userId },
      data,
    });
  },

  async delete(id: string, userId: string): Promise<SlackConnection> {
    return prisma.slackConnection.delete({
      where: { id, userId },
    });
  },
};
