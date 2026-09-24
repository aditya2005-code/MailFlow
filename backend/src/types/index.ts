// ─── Shared API Response Shape ───────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// ─── HTTP Error ───────────────────────────────────────────────────────────────

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
    // Restore prototype chain (needed when targeting ES5 or CommonJS with extends Error)
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}
