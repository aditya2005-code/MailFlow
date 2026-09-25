import { User } from '@prisma/client';
import { userRepository, CreateUserData, UpdateUserData } from '../repositories/userRepository.js';
import { NotFoundError, ConflictError, ValidationError } from '../errors/appErrors.js';
import { z } from 'zod';

const emailSchema = z.string().email();

export const userService = {
  async createUser(data: CreateUserData): Promise<User> {
    if (!data.googleId) {
      throw new ValidationError('Google ID is required to create a user.');
    }

    if (!emailSchema.safeParse(data.email).success) {
      throw new ValidationError('Invalid email address format.');
    }

    const existingEmail = await userRepository.findByEmail(data.email);
    if (existingEmail) {
      throw new ConflictError(`User with email '${data.email}' already exists.`);
    }

    const existingGoogle = await userRepository.findByGoogleId(data.googleId);
    if (existingGoogle) {
      throw new ConflictError(`User with Google ID '${data.googleId}' already exists.`);
    }

    return userRepository.create(data);
  },

  async getUserById(id: string): Promise<User> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new NotFoundError(`User with ID '${id}' not found.`);
    }
    return user;
  },

  async getUserByEmail(email: string): Promise<User | null> {
    return userRepository.findByEmail(email);
  },

  async getUserByGoogleId(googleId: string): Promise<User | null> {
    return userRepository.findByGoogleId(googleId);
  },

  async updateUser(id: string, data: UpdateUserData): Promise<User> {
    await this.getUserById(id); // Ensure user exists
    return userRepository.update(id, data);
  },
};
