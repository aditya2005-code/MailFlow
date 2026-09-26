import axios from 'axios';
import type {
  ApiResponse,
  Campaign,
  CreateCampaignRequest,
  Email,
  BulkEmailRequestItem,
  BulkCreateResponseData,
  Sender,
  User,
} from '../types/index.js';

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
 * Sender API service functions
 */
export const senderApi = {
  async getSenders(): Promise<Sender[]> {
    const res = await api.get<ApiResponse<Sender[]>>('/senders');
    return res.data.data;
  },

  async createSender(data: { name: string; email: string }): Promise<Sender> {
    const res = await api.post<ApiResponse<Sender>>('/senders', data);
    return res.data.data;
  },
};

/**
 * Campaign API service functions
 */
export const campaignApi = {
  async createCampaign(data: CreateCampaignRequest): Promise<Campaign> {
    const res = await api.post<ApiResponse<Campaign>>('/campaigns', data);
    return res.data.data;
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

  async bulkCreateEmails(
    campaignId: string,
    items: BulkEmailRequestItem[],
  ): Promise<ApiResponse<BulkCreateResponseData>> {
    const res = await api.post<ApiResponse<BulkCreateResponseData>>('/emails/bulk', {
      campaignId,
      items,
    });
    return res.data;
  },
};
