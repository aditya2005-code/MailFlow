import { checkRedisHealth, closeRedisClient } from '../config/redis.js';
import { env } from '../config/env.js';

async function testRedisConnection() {
  console.log('\n--- Redis Connection Test ---');
  console.log(`Connecting to Redis at ${env.REDIS_HOST}:${env.REDIS_PORT}...`);

  const result = await checkRedisHealth();

  if (result.status === 'up') {
    console.log('✅ Connected to Redis successfully!');
    console.log(`Ping latency: ${result.latencyMs}ms`);
  } else {
    console.error('❌ Redis connection failed!');
    console.error(`Error: ${result.error ?? 'Unknown error'}`);
    process.exitCode = 1;
  }

  await closeRedisClient();
}

testRedisConnection();
