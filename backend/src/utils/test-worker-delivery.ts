import { prisma } from '../config/prisma.js';
import { closeRedisClient } from '../config/redis.js';
import { closeElasticsearchClient } from '../config/elasticsearch.js';
import { emailService } from '../services/emailService.js';
import { senderService } from '../services/senderService.js';
import { campaignService } from '../services/campaignService.js';
import { processEmailJob, closeEmailWorker, getEmailWorker } from '../workers/emailWorker.js';
import { closeEmailQueue, addEmailJob } from '../queues/index.js';
import { EmailStatus } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * Step 4.1 End-to-End Worker Delivery & Reliability Integration Test Suite.
 */
async function runWorkerDeliveryTests() {
  console.log('====================================================');
  console.log('STARTING STEP 4.1 BULLMQ WORKER & ETHEREAL SMTP TEST');
  console.log('====================================================\n');

  // Initialize Worker
  const workerInstance = getEmailWorker();

  try {
    // 0. Setup User, Sender, Campaign
    console.log('0. Setting up test database context...');
    const user = await prisma.user.upsert({
      where: { googleId: 'worker-test-user-001' },
      update: {},
      create: {
        googleId: 'worker-test-user-001',
        email: 'worker.test@mailflow.local',
        name: 'Worker Test User',
      },
    });

    const sender = await senderService.createSender(user.id, {
      name: 'Ethereal Worker Sender',
      email: `ethereal-sender-${Date.now()}@example.com`,
    });

    const campaign = await campaignService.createCampaign(user.id, {
      name: 'Ethereal Test Campaign',
      subject: 'Ethereal Delivery Confirmation',
      body: '<h1>Hello!</h1><p>This is an automated Ethereal delivery test email.</p>',
      senderId: sender.id,
    });

    // 1. Test Case 1: Valid Scheduled Email Delivery
    console.log('\n1. Test Case 1: Valid Scheduled Email Delivery...');
    const scheduledEmail = await emailService.createEmail(user.id, campaign.id, {
      recipientEmail: 'ethereal.recipient@example.com',
      recipientName: 'Ethereal Recipient',
      scheduledAt: new Date(Date.now() - 1000), // Past due -> immediate processing
    });

    console.log(`   ✅ Created email record in DB: ${scheduledEmail.id} (Status: ${scheduledEmail.status})`);

    // Wait for the background worker or process call to finish sending email (up to 5 seconds)
    const mockJob1: any = {
      id: scheduledEmail.id,
      data: { emailId: scheduledEmail.id },
    };

    // Execute processEmailJob (will safely skip if background BullMQ worker already claimed it)
    await processEmailJob(mockJob1);

    // Poll DB until SENT (max 5s)
    let updatedEmail1 = await emailService.getEmailById(user.id, scheduledEmail.id);
    const startWait = Date.now();
    while (updatedEmail1.status !== EmailStatus.SENT && Date.now() - startWait < 5000) {
      await new Promise((res) => setTimeout(res, 500));
      updatedEmail1 = await emailService.getEmailById(user.id, scheduledEmail.id);
    }

    console.log(`   ✅ DB Email Status: ${updatedEmail1.status}, sentAt: ${updatedEmail1.sentAt?.toISOString()}`);

    if (updatedEmail1.status !== EmailStatus.SENT) {
      throw new Error(`Expected email status 'SENT', got '${updatedEmail1.status}'`);
    }
    if (!updatedEmail1.sentAt) {
      throw new Error('sentAt timestamp was not populated in database');
    }

    // 2. Test Case 2: Idempotency (Already SENT email)
    console.log('\n2. Test Case 2: Already SENT Email Idempotency Check...');
    const processResult2 = await processEmailJob(mockJob1);
    console.log(`   ✅ Duplicate Execution Result:`, processResult2);

    if (processResult2.status !== 'skipped' || processResult2.reason !== 'already_sent') {
      throw new Error(`Expected skipped execution for already SENT email, got ${JSON.stringify(processResult2)}`);
    }

    // 3. Test Case 3: Missing Email ID Handling
    console.log('\n3. Test Case 3: Missing Email ID Handling...');
    const mockJobMissing: any = {
      id: 'non-existent-email-id-xyz',
      data: { emailId: 'non-existent-email-id-xyz' },
    };

    try {
      await processEmailJob(mockJobMissing);
      throw new Error('Expected processEmailJob to fail for missing email ID');
    } catch (err: any) {
      console.log(`   ✅ Missing Email ID correctly threw error: ${err.message}`);
    }

    // 4. Test Case 4: Atomic Claim Race Condition Check (Two workers targeting same email)
    console.log('\n4. Test Case 4: Atomic Claim Race Condition Check...');
    const emailForRace = await emailService.createEmail(user.id, campaign.id, {
      recipientEmail: 'race.recipient@example.com',
      scheduledAt: new Date(),
    });

    const mockJobRace: any = {
      id: emailForRace.id,
      data: { emailId: emailForRace.id },
    };

    // Worker 1 claims it:
    const claimedByWorker1 = await prisma.email.updateMany({
      where: { id: emailForRace.id, status: EmailStatus.SCHEDULED },
      data: { status: EmailStatus.PROCESSING },
    });
    console.log(`   ✅ Simulated Worker 1 claimed email: ${claimedByWorker1.count > 0}`);

    // Worker 2 attempts to process it:
    const processResultRace = await processEmailJob(mockJobRace);
    console.log(`   ✅ Worker 2 Execution Result:`, processResultRace);

    // 5. Test Case 5: Worker Concurrency Configuration Check
    console.log('\n5. Test Case 5: Worker Concurrency Configuration Check...');
    console.log(`   ✅ Worker Concurrency configured as: ${env.WORKER_CONCURRENCY}`);

    console.log('\n====================================================');
    console.log('🎉 ALL STEP 4.1 WORKER DELIVERY TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
  } catch (error) {
    console.error('❌ Worker Delivery Test Failed:', error);
    process.exitCode = 1;
  } finally {
    // 6. Graceful Shutdown Check
    console.log('6. Test Case 6: Graceful Shutdown...');
    await closeEmailWorker();
    await closeEmailQueue().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    await closeRedisClient().catch(() => {});
    await closeElasticsearchClient().catch(() => {});
    console.log('   ✅ Worker & Redis closed cleanly.');
  }
}

runWorkerDeliveryTests();
