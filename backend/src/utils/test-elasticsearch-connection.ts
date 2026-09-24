import { checkElasticsearchHealth, closeElasticsearchClient } from '../config/elasticsearch.js';
import { env } from '../config/env.js';

async function testElasticsearchConnection() {
  console.log('\n--- Elasticsearch Connection Test ---');
  console.log(`Connecting to Elasticsearch at ${env.ELASTICSEARCH_URL}...`);

  const result = await checkElasticsearchHealth();

  if (result.status === 'up') {
    console.log('✅ Connected to Elasticsearch successfully!');
    console.log(`Cluster Name : ${result.clusterName ?? 'unknown'}`);
    console.log(`ES Version   : ${result.version ?? 'unknown'}`);
    console.log(`Ping Latency : ${result.latencyMs}ms`);
  } else {
    console.error('❌ Elasticsearch connection failed!');
    console.error(`Error: ${result.error ?? 'Unknown error'}`);
    process.exitCode = 1;
  }

  await closeElasticsearchClient();
}

testElasticsearchConnection();
