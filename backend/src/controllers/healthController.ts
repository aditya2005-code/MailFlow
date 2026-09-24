import { Request, Response } from 'express';
import { ApiResponse } from '../types/index.js';
import { env } from '../config/env.js';

interface HealthData {
  status: 'ok';
  environment: string;
  timestamp: string;
  uptime: number;
}

/**
 * GET /health
 *
 * Returns a lightweight JSON response that load-balancers and monitoring
 * tools can use to confirm the service is running.
 */
export function healthCheck(_req: Request, res: Response): void {
  const body: ApiResponse<HealthData> = {
    success: true,
    data: {
      status: 'ok',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    },
  };

  res.status(200).json(body);
}
