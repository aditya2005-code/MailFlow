import { User } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export interface CreateUserData {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface UpdateUserData {
  name?: string;
  avatarUrl?: string;
}

export const userRepository = {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  },

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  },

  async findByGoogleId(googleId: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { googleId },
    });
  },

  async create(data: CreateUserData): Promise<User> {
    return prisma.user.create({
      data,
    });
  },

  async update(id: string, data: UpdateUserData): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  },
};
