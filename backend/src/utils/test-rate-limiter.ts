import { prisma } from '../config/prisma.js';
import { closeRedisClient } from '../config/redis.js';
import { closeElasticsearchClient } from '../config/elasticsearch.js';
import { emailService } from '../services/emailService.js';
import { senderService } from '../services/senderService.js';
import { campaignService } from '../services/campaignService.js';
import { processEmailJob, closeEmailWorker } from '../workers/emailWorker.js';
import { closeEmailQueue } from '../queues/index.js';
import { rateLimitService } from '../services/rateLimitService.js';
import { EmailStatus } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * Distributed Email Rate Limiting Integration Test Suite.
 */
async function runRateLimiterTests() {
  console.log('--- Starting Distributed Rate Limiter Tests ---');

  const testKeyPrefix = `test-${Date.now()}`;

  try {
    // 0. Setup User, Sender, Campaign Context
    console.log('0. Setting up test database context...');
    const user = await prisma.user.upsert({
      where: { googleId: 'ratelimit-test-user-001' },
      update: {},
      create: {
        googleId: 'ratelimit-test-user-001',
        email: 'ratelimit.test@mailflow.local',
        name: 'Rate Limit Test User',
      },
    });

    const sender = await senderService.createSender(user.id, {
      name: 'Rate Limit Sender',
      email: `ratelimit-sender-${Date.now()}@example.com`,
    });

    const campaign = await campaignService.createCampaign(user.id, {
      name: 'Rate Limit Campaign',
      subject: 'Rate Limit Subject',
      body: '<p>Rate Limit Test Body</p>',
      senderId: sender.id,
    });

    // F. TEST F: Configuration Check
    console.log('\n--- TEST F: Environment Configuration Check ---');
    console.log(`   ✅ env.WORKER_CONCURRENCY: ${env.WORKER_CONCURRENCY}`);
    console.log(`   ✅ env.MIN_EMAIL_DELAY_MS: ${env.MIN_EMAIL_DELAY_MS}`);
    console.log(`   ✅ env.MAX_EMAILS_PER_HOUR: ${env.MAX_EMAILS_PER_HOUR}`);

    if (env.WORKER_CONCURRENCY !== 5) throw new Error('Expected WORKER_CONCURRENCY = 5');
    if (env.MIN_EMAIL_DELAY_MS !== 2000) throw new Error('Expected MIN_EMAIL_DELAY_MS = 2000');
    if (env.MAX_EMAILS_PER_HOUR !== 100) throw new Error('Expected MAX_EMAILS_PER_HOUR = 100');

    // A. TEST A: Hourly Limit (Limit = 3)
    console.log('\n--- TEST A: Hourly Limit (max = 3) ---');
    await rateLimitService.resetLimits({ keyPrefix: testKeyPrefix });

    const optsA = { maxEmailsPerHour: 3, minEmailDelayMs: 0, keyPrefix: testKeyPrefix };

    const slotA1 = await rateLimitService.acquireSendSlot(optsA);
    const slotA2 = await rateLimitService.acquireSendSlot(optsA);
    const slotA3 = await rateLimitService.acquireSendSlot(optsA);

    console.log('   Slot 1:', slotA1.allowed, 'Count:', slotA1.currentHourlyCount);
    console.log('   Slot 2:', slotA2.allowed, 'Count:', slotA2.currentHourlyCount);
    console.log('   Slot 3:', slotA3.allowed, 'Count:', slotA3.currentHourlyCount);

    if (!slotA1.allowed || !slotA2.allowed || !slotA3.allowed) {
      throw new Error('First 3 hourly slots should have been allowed');
    }

    const slotA4 = await rateLimitService.acquireSendSlot(optsA);
    console.log('   Slot 4 (Hourly Exceeded):', slotA4);

    if (slotA4.allowed || slotA4.reason !== 'hourly_limit_reached') {
      throw new Error(`Expected 4th slot to be denied with 'hourly_limit_reached', got ${JSON.stringify(slotA4)}`);
    }

    // B. TEST B: Distributed Safety (Concurrent processes)
    console.log('\n--- TEST B: Distributed Concurrency Safety ---');
    const testPrefixB = `dist-test-${Date.now()}`;
    const optsB = { maxEmailsPerHour: 5, minEmailDelayMs: 0, keyPrefix: testPrefixB };

    // Simulate 10 workers requesting slots simultaneously
    const concurrentAcquires = await Promise.all(
      Array.from({ length: 10 }).map(() => rateLimitService.acquireSendSlot(optsB)),
    );

    const allowedCountB = concurrentAcquires.filter((res) => res.allowed).length;
    const deniedCountB = concurrentAcquires.filter((res) => !res.allowed).length;

    console.log(`   ✅ Concurrent attempts: 10 total. Allowed: ${allowedCountB}, Denied: ${deniedCountB}`);

    if (allowedCountB !== 5) {
      throw new Error(`Expected exactly 5 slots allowed concurrently, got ${allowedCountB}`);
    }
    if (deniedCountB !== 5) {
      throw new Error(`Expected exactly 5 slots denied concurrently, got ${deniedCountB}`);
    }

    // C. TEST C: Minimum Inter-Email Delay (2000ms)
    console.log('\n--- TEST C: Minimum Inter-Email Delay (2000ms) ---');
    const testPrefixC = `delay-test-${Date.now()}`;
    const optsC = { maxEmailsPerHour: 100, minEmailDelayMs: 2000, keyPrefix: testPrefixC };

    const slotC1 = await rateLimitService.acquireSendSlot(optsC);
    console.log('   Send 1 (t=0):', slotC1.allowed);

    if (!slotC1.allowed) throw new Error('First send should be allowed immediately');

    // Immediate second send (0ms elapsed < 2000ms delay required)
    const slotC2 = await rateLimitService.acquireSendSlot(optsC);
    console.log('   Send 2 (immediate):', slotC2);

    if (slotC2.allowed || slotC2.reason !== 'min_delay_required') {
      throw new Error(`Expected second send to be denied with 'min_delay_required', got ${JSON.stringify(slotC2)}`);
    }
    if (slotC2.delayMs < 1900 || slotC2.delayMs > 2000) {
      throw new Error(`Expected delayMs to be ~2000ms, got ${slotC2.delayMs}ms`);
    }

    // D & E. TEST D & E: Rescheduling & No Dropped Emails in Worker Process
    console.log('\n--- TEST D & E: Worker Rescheduling & No Dropped Emails ---');
    const emailToRateLimit = await emailService.createEmail(user.id, campaign.id, {
      recipientEmail: 'ratelimited.recipient@example.com',
      scheduledAt: new Date(),
    });

    const mockJobRateLimit: any = {
      id: emailToRateLimit.id,
      data: { emailId: emailToRateLimit.id },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    // Fill global hourly capacity by acquiring MAX_EMAILS_PER_HOUR slots
    console.log('   Filling hourly capacity limit...');
    const currentWindowStr = rateLimitService.getHourlyWindowString();
    const redis = (await import('../config/redis.js')).getRedisClient();
    await redis.set(`mailflow:rate-limit:global:hourly:${currentWindowStr}`, '100');

    // Process job through worker
    const processResult = await processEmailJob(mockJobRateLimit);
    console.log('   ✅ Worker Execution Result:', processResult);

    if (processResult.status !== 'rescheduled' || processResult.reason !== 'hourly_limit_reached') {
      throw new Error(`Expected job to be rescheduled due to hourly limit, got ${JSON.stringify(processResult)}`);
    }

    // Verify PostgreSQL email status remains SCHEDULED (not FAILED, not dropped)
    const dbEmailAfterLimit = await emailService.getEmailById(user.id, emailToRateLimit.id);
    console.log(`   ✅ DB Email Status after rate limit: ${dbEmailAfterLimit.status}`);

    if (dbEmailAfterLimit.status !== EmailStatus.SCHEDULED) {
      throw new Error(`Expected DB email status to remain 'SCHEDULED', got '${dbEmailAfterLimit.status}'`);
    }

    // Reset Redis hourly count for cleanup
    await redis.del(`mailflow:rate-limit:global:hourly:${currentWindowStr}`);

    console.log('✅ Rate Limiter Tests Completed Successfully!');
  } catch (error) {
    console.error('❌ Rate Limiter Test Suite Failed:', error);
    process.exitCode = 1;
  } finally {
    await closeEmailWorker().catch(() => {});
    await closeEmailQueue().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    await closeRedisClient().catch(() => {});
    await closeElasticsearchClient().catch(() => {});
  }
}

runRateLimiterTests();
