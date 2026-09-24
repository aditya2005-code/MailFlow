import { Client } from '@elastic/elasticsearch';
import { env } from './env.js';

if (!env.ELASTICSEARCH_URL) {
  throw new Error('[elasticsearch] ELASTICSEARCH_URL environment variable is required.');
}

let elasticsearchClientInstance: Client | null = null;

/**
 * Get or initialize a singleton Elasticsearch client instance.
 */
export function getElasticsearchClient(): Client {
  if (!elasticsearchClientInstance) {
    if (!env.ELASTICSEARCH_URL) {
      throw new Error('[elasticsearch] ELASTICSEARCH_URL is not configured.');
    }

    elasticsearchClientInstance = new Client({
      node: env.ELASTICSEARCH_URL,
      requestTimeout: 10000,
      maxRetries: 3,
    });
  }

  return elasticsearchClientInstance;
}

/**
 * Exported singleton client instance for convenient application imports.
 */
export const elasticsearchClient = getElasticsearchClient();

export interface ElasticsearchHealthResult {
  status: 'up' | 'down';
  version?: string;
  clusterName?: string;
  latencyMs?: number;
  error?: string;
}

/**
 * Lightweight connectivity check for Elasticsearch reachability verification.
 */
export async function checkElasticsearchHealth(timeoutMs = 5000): Promise<ElasticsearchHealthResult> {
  const client = getElasticsearchClient();
  const startTime = Date.now();
  let timerId: NodeJS.Timeout | undefined;

  try {
    const infoPromise = client.info();
    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => reject(new Error('Elasticsearch ping timed out')), timeoutMs);
    });

    const info = await Promise.race([infoPromise, timeoutPromise]);
    const latencyMs = Date.now() - startTime;

    return {
      status: 'up',
      version: info.version.number,
      clusterName: info.cluster_name,
      latencyMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'down',
      error: errorMessage.includes('timed out') ? 'Elasticsearch ping timed out' : 'Elasticsearch connection failed',
    };
  } finally {
    if (timerId) {
      clearTimeout(timerId);
    }
  }
}

/**
 * Close Elasticsearch client connection gracefully.
 */
export async function closeElasticsearchClient(): Promise<void> {
  if (elasticsearchClientInstance) {
    await elasticsearchClientInstance.close();
    elasticsearchClientInstance = null;
  }
}
