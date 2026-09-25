// ─── Shared API Response & Pagination Types ─────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  pagination?: PaginationMeta;
  error?: string | ApiErrorPayload;
  message?: string;
}

// ─── HTTP Error Base Class ───────────────────────────────────────────────────

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = 'INTERNAL_SERVER_ERROR',
  ) {
    super(message);
    this.name = 'HttpError';
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

// ─── Express Request Declaration Extension ────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
