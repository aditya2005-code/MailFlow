import { Request, Response } from 'express';
import { ApiResponse } from '../types/index.js';
import { env } from '../config/env.js';
import { getInfrastructureHealth, InfrastructureHealthData } from '../services/healthService.js';

interface LivenessData {
  status: 'ok';
  service: string;
  environment: string;
  timestamp: string;
  uptime: number;
}

/**
 * GET /api/v1/health
 *
 * Lightweight liveness probe — no DB/Redis/ES dependency check required.
 * Confirms that the Express HTTP server process is running and accepting requests.
 */
export function healthCheck(_req: Request, res: Response): void {
  const body: ApiResponse<LivenessData> = {
    success: true,
    data: {
      status: 'ok',
      service: 'MailFlow API',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    },
  };

  res.status(200).json(body);
}

/**
 * GET /api/v1/health/infrastructure
 *
 * Comprehensive infrastructure readiness probe — checks PostgreSQL, Redis, and Elasticsearch.
 * Returns HTTP 200 when all services are healthy, or HTTP 503 degraded status if any dependency is down.
 */
export async function infrastructureHealthCheck(_req: Request, res: Response): Promise<void> {
  try {
    const { isHealthy, data } = await getInfrastructureHealth();

    const statusCode = isHealthy ? 200 : 503;
    const body: ApiResponse<InfrastructureHealthData> = {
      success: isHealthy,
      data,
      ...(isHealthy ? {} : { error: 'Infrastructure health degraded' }),
    };

    res.status(statusCode).json(body);
  } catch (error) {
    // Fail-safe catch block ensuring no unhandled exception or raw stack trace leaks
    res.status(503).json({
      success: false,
      error: 'Failed to perform infrastructure health checks',
    });
  }
}
