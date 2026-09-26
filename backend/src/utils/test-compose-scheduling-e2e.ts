import { prisma } from '../config/prisma.js';
import { senderService } from '../services/senderService.js';
import { campaignService } from '../services/campaignService.js';
import { emailService } from '../services/emailService.js';
import { getEmailQueue, closeEmailQueue } from '../queues/index.js';
import { getEmailWorker, closeEmailWorker } from '../workers/emailWorker.js';
import { elasticsearchService } from '../services/elasticsearchService.js';
import { closeRedisClient } from '../config/redis.js';
import { EmailStatus } from '@prisma/client';

async function runE2EComposeTest() {
  console.log('--- Starting Compose & Scheduling E2E Test ---');

  try {
    // 1. Setup Test User & Sender
    const user = await prisma.user.upsert({
      where: { googleId: 'test-compose-google-id-777' },
      update: {},
      create: {
        googleId: 'test-compose-google-id-777',
        email: 'compose.e2e@mailflow.local',
        name: 'Compose E2E User',
      },
    });

    console.log(`👤 User retrieved/created: ${user.email} (ID: ${user.id})`);

    let sender = (await senderService.getSendersByUser(user.id))[0];
    if (!sender) {
      sender = await senderService.createSender(user.id, {
        name: 'E2E Marketing Sender',
        email: 'marketing@mailflow.local',
      });
    }
    console.log(`✉️ Sender retrieved/created: ${sender.name} <${sender.email}>`);

    // 2. Create Campaign (Phase 7.2 Flow Step 1)
    const campaignSubject = 'Phase 7.2 Launch Announcement';
    const campaignBody = 'Hello! This is a test email sent via MailFlow delayed scheduling.';

    const campaign = await campaignService.createCampaign(user.id, {
      senderId: sender.id,
      name: campaignSubject,
      subject: campaignSubject,
      body: campaignBody,
    });
    console.log(`📢 Campaign created in DB: ID=${campaign.id}, Subject="${campaign.subject}"`);

    // 3. Simulated Parsed CSV Recipients (Phase 7.2 Flow Step 2)
    const futureScheduledAt = new Date(Date.now() + 2000); // Scheduled +2s in the future
    const parsedCsvRecipients = [
      { recipientEmail: 'alice.e2e@ethereal.email', recipientName: 'Alice E2E', scheduledAt: futureScheduledAt },
      { recipientEmail: 'bob.e2e@ethereal.email', recipientName: 'Bob E2E', scheduledAt: futureScheduledAt },
    ];

    console.log(`\n--- Bulk Creating Emails from CSV Recipients (${parsedCsvRecipients.length} recipients) ---`);
    const bulkResult = await emailService.bulkCreateEmails(user.id, campaign.id, parsedCsvRecipients);
    console.log(`✅ Bulk create complete: ${bulkResult.count} created, ${bulkResult.duplicatesSkipped} duplicates skipped.`);

    // 4. Verify PostgreSQL Database State
    const createdEmails = await emailService.getEmailsByCampaign(user.id, campaign.id);
    if (createdEmails.emails.length !== 2) {
      throw new Error(`Expected 2 emails created in DB, found ${createdEmails.emails.length}`);
    }

    const firstEmail = createdEmails.emails[0];
    if (!firstEmail) {
      throw new Error('First email record missing from bulk creation');
    }
    if (firstEmail.status !== EmailStatus.SCHEDULED) {
      throw new Error(`Expected status SCHEDULED, found ${firstEmail.status}`);
    }
    console.log(`💾 PostgreSQL verification passed: ${createdEmails.emails.length} emails in SCHEDULED status.`);

    // 5. Verify BullMQ Queue Delayed Job
    const queue = getEmailQueue();
    queue.on('error', () => {}); // Handle connection close event silently during teardown
    const job = await queue.getJob(firstEmail.id);
    if (!job) {
      throw new Error(`BullMQ job not found for emailId: ${firstEmail.id}`);
    }
    const isDelayed = await job.isDelayed();
    console.log(`🐂 BullMQ verification passed: Delayed job ${job.id} exists in queue (isDelayed=${isDelayed}).`);

    // 6. Verify Elasticsearch Indexing
    const searchRes = await elasticsearchService.searchEmails({
      userId: user.id,
      query: 'Launch Announcement',
      status: EmailStatus.SCHEDULED,
      page: 1,
      limit: 10,
    });
    console.log(`🔍 Elasticsearch verification passed: Found ${searchRes.total} indexed email(s) for query.`);

    // 7. Start Email Worker & Process Delayed Job
    console.log('\n--- Starting BullMQ Worker to process scheduled email delivery ---');
    const worker = getEmailWorker();

    // Wait up to 15 seconds for worker to deliver emails past the +2s delay and minimum send delay
    let updatedEmails = await prisma.email.findMany({ where: { campaignId: campaign.id } });
    let sentCount = updatedEmails.filter(e => e.status === EmailStatus.SENT).length;
    let pollAttempts = 0;

    while (sentCount === 0 && pollAttempts < 15) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      updatedEmails = await prisma.email.findMany({ where: { campaignId: campaign.id } });
      sentCount = updatedEmails.filter(e => e.status === EmailStatus.SENT).length;
      pollAttempts++;
    }

    console.log(`📊 Campaign emails status post-worker run:`, updatedEmails.map(e => `${e.recipientEmail}: ${e.status}`).join(', '));

    if (sentCount === 0) {
      throw new Error(`Expected at least 1 email to be delivered to SENT status by worker, found 0`);
    }
    console.log(`🎉 E2E Delivery verification passed: ${sentCount}/${updatedEmails.length} email(s) delivered by worker!`);

    // Cleanup worker & queue instance
    await closeEmailWorker();
    await closeEmailQueue();
    await prisma.$disconnect();

    console.log('✅ Compose & Scheduling E2E Tests Completed Successfully!');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ E2E Compose Test Error:', err);
    await closeEmailWorker();
    await closeEmailQueue();
    await prisma.$disconnect();
    process.exit(1);
  }
}

runE2EComposeTest();
