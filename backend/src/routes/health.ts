import { Router } from 'express';
import { healthCheck, infrastructureHealthCheck } from '../controllers/healthController.js';

const router = Router();

/**
 * GET /api/v1/health
 * Liveness probe — basic application availability check.
 */
router.get('/', healthCheck);

/**
 * GET /api/v1/health/infrastructure
 * Readiness probe — checks PostgreSQL, Redis, and Elasticsearch.
 */
router.get('/infrastructure', infrastructureHealthCheck);

export default router;
