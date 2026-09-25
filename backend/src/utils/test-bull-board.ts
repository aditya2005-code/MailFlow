import { createApp } from '../app.js';
import http from 'http';
import { prisma } from '../config/prisma.js';
import { emailService } from '../services/emailService.js';
import { senderService } from '../services/senderService.js';
import { campaignService } from '../services/campaignService.js';
import { closeEmailWorker, processEmailJob } from '../workers/emailWorker.js';
import { closeEmailQueue, getEmailJob } from '../queues/index.js';
import { closeRedisClient } from '../config/redis.js';
import { closeElasticsearchClient } from '../config/elasticsearch.js';

/**
 * Step 5.3 Bull Board Integration & Route Test Suite
 */
async function runBullBoardTests() {
  console.log('====================================================');
  console.log('STARTING STEP 5.3 BULL BOARD DASHBOARD TESTS');
  console.log('====================================================\n');

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://localhost:${address.port}`;

  try {
    // 1. Test A: GET /admin/queues Dashboard Route HTTP response
    console.log('1. Testing GET /admin/queues HTTP response...');
    const response = await fetch(`${baseUrl}/admin/queues/`);
    console.log(`   ✅ GET /admin/queues/ Status: ${response.status}`);

    if (response.status !== 200) {
      throw new Error(`Expected HTTP 200 from Bull Board dashboard route, got ${response.status}`);
    }

    const html = await response.text();
    if (!html.includes('BullMQ') && !html.includes('queues') && !html.includes('bull-board')) {
      throw new Error('Bull Board UI HTML content missing expected queue dashboard markers');
    }
    console.log('   ✅ Bull Board UI HTML rendered correctly.');

    // 2. Test B: Queue Job Lifecycle & Visibility
    console.log('\n2. Testing Queue Job Lifecycle Visibility in Bull Board...');
    const user = await prisma.user.upsert({
      where: { googleId: 'bullboard-test-user' },
      update: {},
      create: {
        googleId: 'bullboard-test-user',
        email: 'bullboard.test@mailflow.local',
        name: 'Bull Board Test User',
      },
    });

    const sender = await senderService.createSender(user.id, {
      name: 'Bull Board Sender',
      email: `bullboard-${Date.now()}@example.com`,
    });

    const campaign = await campaignService.createCampaign(user.id, {
      name: 'Bull Board Campaign',
      subject: 'Bull Board Test Subject',
      body: '<p>Bull Board Test Body</p>',
      senderId: sender.id,
    });

    // Create a delayed email job (10 seconds future delay)
    const futureDate = new Date(Date.now() + 10000);
    const scheduledEmail = await emailService.createEmail(user.id, campaign.id, {
      recipientEmail: 'bullboard.recipient@example.com',
      scheduledAt: futureDate,
    });

    console.log(`   ✅ Created scheduled email record: ${scheduledEmail.id}`);

    // Verify delayed job exists in BullMQ queue monitored by Bull Board
    const queuedJob = await getEmailJob(scheduledEmail.id);
    if (!queuedJob) {
      throw new Error(`Job ${scheduledEmail.id} not found in monitored BullMQ queue`);
    }

    const isDelayed = await queuedJob.isDelayed();
    console.log(`   ✅ Monitored Job ${queuedJob.id} is delayed: ${isDelayed}`);
    if (!isDelayed) {
      throw new Error(`Expected job ${scheduledEmail.id} to be in delayed state`);
    }

    // Process job through worker
    console.log(`   Processing job through worker...`);
    const mockJob: any = {
      id: scheduledEmail.id,
      data: { emailId: scheduledEmail.id },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    const processResult = await processEmailJob(mockJob);
    console.log(`   ✅ Job Process Result:`, processResult);

    console.log('\n====================================================');
    console.log('🎉 ALL STEP 5.3 BULL BOARD TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
  } catch (error) {
    console.error('❌ Bull Board Test Failed:', error);
    process.exitCode = 1;
  } finally {
    server.close();
    await closeEmailWorker().catch(() => {});
    await closeEmailQueue().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    await closeRedisClient().catch(() => {});
    await closeElasticsearchClient().catch(() => {});
  }
}

runBullBoardTests();
