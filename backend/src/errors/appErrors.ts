import { HttpError } from '../types/index.js';

export class NotFoundError extends HttpError {
  constructor(message: string = 'Resource not found') {
    super(404, message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends HttpError {
  constructor(message: string = 'Validation failed') {
    super(400, message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class ConflictError extends HttpError {
  constructor(message: string = 'Resource conflict') {
    super(409, message, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string = 'Access denied') {
    super(403, message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string = 'Authentication required') {
    super(401, message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}
