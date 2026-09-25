import { elasticsearchService } from '../services/elasticsearchService.js';
import { closeElasticsearchClient } from '../config/elasticsearch.js';
import { prisma } from '../config/prisma.js';

/**
 * Reindex utility script.
 * Rebuilds the Elasticsearch index from PostgreSQL records without modifying DB state.
 */
async function runReindex() {
  console.log('====================================================');
  console.log('STARTING ELASTICSEARCH EMAIL REINDEX UTILITY');
  console.log('====================================================\n');

  try {
    const result = await elasticsearchService.reindexAllEmailsFromPostgres();
    console.log(`\n✅ Reindexing complete! Total documents indexed: ${result.totalIndexed}`);
  } catch (error) {
    console.error('❌ Reindex failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
    await closeElasticsearchClient().catch(() => {});
  }
}

runReindex();
