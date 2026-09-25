import { Sender } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export interface CreateSenderData {
  userId: string;
  email: string;
  name: string;
}

export interface UpdateSenderData {
  name?: string;
  email?: string;
}

export const senderRepository = {
  async findById(id: string): Promise<Sender | null> {
    return prisma.sender.findUnique({
      where: { id },
    });
  },

  async findByUserId(userId: string): Promise<Sender[]> {
    return prisma.sender.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async findByUserAndEmail(userId: string, email: string): Promise<Sender | null> {
    return prisma.sender.findUnique({
      where: {
        userId_email: {
          userId,
          email,
        },
      },
    });
  },

  async create(data: CreateSenderData): Promise<Sender> {
    return prisma.sender.create({
      data,
    });
  },

  async update(id: string, userId: string, data: UpdateSenderData): Promise<Sender> {
    // Scoped by id and userId to enforce ownership at the database level
    return prisma.sender.update({
      where: { id, userId },
      data,
    });
  },

  async delete(id: string, userId: string): Promise<Sender> {
    return prisma.sender.delete({
      where: { id, userId },
    });
  },
};
