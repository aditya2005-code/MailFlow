import axios from 'axios';
import type { ApiResponse, Email, User } from '../types/index.js';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
export const AUTH_BASE_URL = 'http://localhost:5000/api/auth';

/**
 * Centralized Axios instance for MailFlow REST API (/api/v1)
 * Configured with credentials support for HTTP-only JWT auth cookies.
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Auth API service functions
 */
export const authApi = {
  getGoogleLoginUrl(): string {
    return `${AUTH_BASE_URL}/google`;
  },

  async getCurrentUser(): Promise<User> {
    const res = await axios.get<ApiResponse<User>>(`${AUTH_BASE_URL}/me`, {
      withCredentials: true,
    });
    return res.data.data;
  },

  async logout(): Promise<void> {
    await axios.post(`${AUTH_BASE_URL}/logout`, {}, { withCredentials: true });
  },
};

/**
 * Email API service functions
 */
export const emailApi = {
  async getEmails(params: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<Email[]>> {
    const res = await api.get<ApiResponse<Email[]>>('/emails', { params });
    return res.data;
  },

  async searchEmails(params: {
    q: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<Email[]>> {
    const res = await api.get<ApiResponse<Email[]>>('/emails/search', { params });
    return res.data;
  },
};
