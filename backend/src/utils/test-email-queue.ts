import {
  addEmailJob,
  getEmailJob,
  removeEmailJob,
  closeEmailQueue,
  EMAIL_QUEUE_NAME,
  SEND_EMAIL_JOB_NAME,
} from '../queues/index.js';
import { checkRedisHealth, closeRedisClient } from '../config/redis.js';

/**
 * Lightweight verification script for BullMQ queue infrastructure.
 * Connects to Redis via BullMQ, enqueues a harmless test job, reads it back,
 * verifies idempotency, removes the test job, and shuts down cleanly.
 */
async function testEmailQueue() {
  console.log('====================================================');
  console.log('STARTING STEP 3.1 BULLMQ QUEUE INFRASTRUCTURE TEST');
  console.log('====================================================\n');

  // 1. Redis Connectivity Check
  console.log('1. Verifying Redis Connectivity...');
  const redisHealth = await checkRedisHealth();
  if (redisHealth.status !== 'up') {
    throw new Error(`Redis is unreachable: ${redisHealth.error}`);
  }
  console.log(`   ✅ Redis is reachable (latency: ${redisHealth.latencyMs}ms)`);

  const testEmailId = `test-email-${Date.now()}`;

  try {
    // 2. Add Test Job
    console.log(`\n2. Enqueuing test job with emailId: ${testEmailId}...`);
    const addedJob = await addEmailJob(testEmailId, 10000); // 10s delay
    console.log(`   ✅ Job added successfully! Job ID: ${addedJob.id}, Name: ${addedJob.name}`);

    // 3. Verify Job Existence & Payload Retrieval
    console.log(`\n3. Fetching job from Queue '${EMAIL_QUEUE_NAME}' by Job ID...`);
    const retrievedJob = await getEmailJob(testEmailId);

    if (!retrievedJob) {
      throw new Error(`Failed to retrieve job with ID '${testEmailId}' from queue.`);
    }

    if (retrievedJob.name !== SEND_EMAIL_JOB_NAME) {
      throw new Error(`Unexpected job name: expected '${SEND_EMAIL_JOB_NAME}', got '${retrievedJob.name}'`);
    }

    if (retrievedJob.data.emailId !== testEmailId) {
      throw new Error(`Payload mismatch: expected emailId '${testEmailId}', got '${retrievedJob.data.emailId}'`);
    }

    console.log(`   ✅ Job retrieved successfully! Data:`, retrievedJob.data);

    // 4. Test Idempotency (Attempting to add duplicate jobId)
    console.log('\n4. Testing Job Idempotency (adding duplicate jobId)...');
    const duplicateJob = await addEmailJob(testEmailId, 5000);
    console.log(`   ✅ Duplicate job request handled safely. Returned Job ID: ${duplicateJob.id}`);

    // 5. Cleanup Test Job
    console.log('\n5. Removing test job from queue...');
    const removed = await removeEmailJob(testEmailId);
    console.log(`   ✅ Test job removed from queue: ${removed}`);

    const verifyRemovedJob = await getEmailJob(testEmailId);
    if (verifyRemovedJob) {
      throw new Error(`Test job '${testEmailId}' was not removed from queue.`);
    }
    console.log('   ✅ Confirmed job no longer exists in queue.');

    console.log('\n====================================================');
    console.log('🎉 BULLMQ QUEUE INFRASTRUCTURE TEST PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
  } catch (error) {
    console.error('❌ BullMQ Queue Verification Failed:', error);
    process.exitCode = 1;
  } finally {
    // 6. Clean Shutdown
    console.log('6. Closing Queue and Redis connections...');
    await closeEmailQueue();
    await closeRedisClient();
    console.log('   ✅ Connections closed cleanly.');
  }
}

testEmailQueue();
