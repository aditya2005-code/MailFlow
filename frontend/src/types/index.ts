export type EmailStatus = 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED';

export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'COMPLETED' | 'FAILED';

export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Sender {
  id: string;
  userId: string;
  email: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Campaign {
  id: string;
  userId: string;
  senderId: string;
  name: string;
  subject: string;
  body: string;
  status: CampaignStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface Email {
  id: string;
  campaignId: string;
  senderId: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt: string | null;
  status: EmailStatus;
  attempts: number;
  lastError: string | null;
  createdAt?: string;
  updatedAt?: string;
  campaign?: {
    id: string;
    name: string;
    subject: string;
  };
  sender?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: PaginationMeta;
  error?: string;
}
