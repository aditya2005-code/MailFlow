import { Client } from '@opensearch-project/opensearch';
import { env } from './env.js';

let openSearchClientInstance: Client | null = null;

/**
 * Get or initialize a singleton OpenSearch client instance.
 * Supports Aiven OpenSearch (HTTPS / service URI / basic auth) & local Docker OpenSearch/Elasticsearch (http://localhost:9200).
 */
export function getOpenSearchClient(): Client {
  if (!openSearchClientInstance) {
    const nodeUrl = env.OPENSEARCH_URL || env.ELASTICSEARCH_URL || 'http://localhost:9200';

    const clientConfig: any = {
      node: nodeUrl,
      requestTimeout: 10000,
      maxRetries: 3,
    };

    if (env.OPENSEARCH_USERNAME && env.OPENSEARCH_PASSWORD) {
      clientConfig.auth = {
        username: env.OPENSEARCH_USERNAME,
        password: env.OPENSEARCH_PASSWORD,
      };
    }

    openSearchClientInstance = new Client(clientConfig);
  }

  return openSearchClientInstance;
}

// Backwards-compatibility aliases for existing codebase
export const getElasticsearchClient = getOpenSearchClient;

export interface OpenSearchHealthResult {
  status: 'up' | 'down';
  version?: string;
  clusterName?: string;
  latencyMs?: number;
  error?: string;
}

export type ElasticsearchHealthResult = OpenSearchHealthResult;

/**
 * Lightweight connectivity check for OpenSearch reachability verification.
 */
export async function checkOpenSearchHealth(timeoutMs = 5000): Promise<OpenSearchHealthResult> {
  const client = getOpenSearchClient();
  const startTime = Date.now();
  let timerId: NodeJS.Timeout | undefined;

  try {
    const infoPromise = client.info();
    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => reject(new Error('OpenSearch ping timed out')), timeoutMs);
    });

    const res = await Promise.race([infoPromise, timeoutPromise]);
    const body = (res as any).body || res;
    const versionNumber = body?.version?.number || '3.6';
    const clusterName = body?.cluster_name || 'opensearch';
    const latencyMs = Date.now() - startTime;

    return {
      status: 'up',
      version: versionNumber,
      clusterName,
      latencyMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const sanitizedError = errorMessage.replace(/https?:\/\/[^@]+@/gi, 'https://***@');
    return {
      status: 'down',
      error: sanitizedError.includes('timed out') ? 'OpenSearch ping timed out' : 'OpenSearch connection failed',
    };
  } finally {
    if (timerId) {
      clearTimeout(timerId);
    }
  }
}

export const checkElasticsearchHealth = checkOpenSearchHealth;

/**
 * Close OpenSearch client connection gracefully.
 */
export async function closeOpenSearchClient(): Promise<void> {
  if (openSearchClientInstance) {
    await openSearchClientInstance.close();
    openSearchClientInstance = null;
  }
}

export const closeElasticsearchClient = closeOpenSearchClient;
