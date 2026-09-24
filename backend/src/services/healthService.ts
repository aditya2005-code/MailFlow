import { checkDatabaseHealth, DatabaseHealthResult } from '../config/prisma.js';
import { checkRedisHealth, RedisHealthResult } from '../config/redis.js';
import { checkElasticsearchHealth, ElasticsearchHealthResult } from '../config/elasticsearch.js';

export interface InfrastructureHealthData {
  status: 'ok' | 'degraded';
  timestamp: string;
  services: {
    database: DatabaseHealthResult;
    redis: RedisHealthResult;
    elasticsearch: ElasticsearchHealthResult;
  };
}

export interface InfrastructureHealthCheckResult {
  isHealthy: boolean;
  data: InfrastructureHealthData;
}

/**
 * Orchestrates infrastructure availability checks across PostgreSQL, Redis, and Elasticsearch.
 */
export async function getInfrastructureHealth(): Promise<InfrastructureHealthCheckResult> {
  const [database, redis, elasticsearch] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
    checkElasticsearchHealth(),
  ]);

  const isHealthy =
    database.status === 'up' &&
    redis.status === 'up' &&
    elasticsearch.status === 'up';

  return {
    isHealthy,
    data: {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database,
        redis,
        elasticsearch,
      },
    },
  };
}
