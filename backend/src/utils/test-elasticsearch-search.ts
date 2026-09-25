import { prisma } from '../config/prisma.js';
import { closeRedisClient } from '../config/redis.js';
import { closeElasticsearchClient, getElasticsearchClient } from '../config/elasticsearch.js';
import { emailService } from '../services/emailService.js';
import { senderService } from '../services/senderService.js';
import { campaignService } from '../services/campaignService.js';
import { elasticsearchService, ELASTICSEARCH_EMAIL_INDEX } from '../services/elasticsearchService.js';
import { closeEmailWorker } from '../workers/emailWorker.js';
import { closeEmailQueue } from '../queues/index.js';
import { EmailStatus } from '@prisma/client';

/**
 * Step 5.2 Elasticsearch Email Indexing and Search Test Suite
 */
async function runElasticsearchSearchTests() {
  console.log('====================================================');
  console.log('STARTING STEP 5.2 ELASTICSEARCH INDEXING & SEARCH TESTS');
  console.log('====================================================\n');

  try {
    // 0. Setup Users, Senders, Campaigns Context
    console.log('0. Setting up test users and campaigns...');

    // User A
    const userA = await prisma.user.upsert({
      where: { googleId: 'es-test-user-A-001' },
      update: {},
      create: {
        googleId: 'es-test-user-A-001',
        email: 'userA@mailflow.local',
        name: 'User A',
      },
    });

    const senderA = await senderService.createSender(userA.id, {
      name: 'User A Sender',
      email: `senderA-${Date.now()}@example.com`,
    });

    const campaignA = await campaignService.createCampaign(userA.id, {
      name: 'User A Campaign',
      subject: 'Newsletter Alpha',
      body: 'Welcome to our product release update.',
      senderId: senderA.id,
    });

    // User B (for User Isolation testing)
    const userB = await prisma.user.upsert({
      where: { googleId: 'es-test-user-B-002' },
      update: {},
      create: {
        googleId: 'es-test-user-B-002',
        email: 'userB@mailflow.local',
        name: 'User B',
      },
    });

    const senderB = await senderService.createSender(userB.id, {
      name: 'User B Sender',
      email: `senderB-${Date.now()}@example.com`,
    });

    const campaignB = await campaignService.createCampaign(userB.id, {
      name: 'User B Campaign',
      subject: 'Confidential Internal Notice',
      body: 'Private financial summary for User B.',
      senderId: senderB.id,
    });

    // A. TEST A: Index Creation
    console.log('\n--- TEST A: Index Creation ---');
    await elasticsearchService.ensureEmailIndex();
    const client = getElasticsearchClient();
    const indexExists = await client.indices.exists({ index: ELASTICSEARCH_EMAIL_INDEX });
    console.log(`   ✅ Index '${ELASTICSEARCH_EMAIL_INDEX}' exists: ${indexExists}`);
    if (!indexExists) throw new Error(`Index '${ELASTICSEARCH_EMAIL_INDEX}' was not created`);

    // B. TEST B: Email Indexing & G. Idempotent Indexing
    console.log('\n--- TEST B & G: Email Indexing & Idempotency ---');
    const email1 = await emailService.createEmail(userA.id, campaignA.id, {
      recipientEmail: 'alice.johnson@example.com',
      recipientName: 'Alice Johnson',
      subject: 'Special Offer inside',
      body: 'Exclusive discount code for loyal subscribers.',
      scheduledAt: new Date(),
    });

    // Index explicitly & test idempotency (indexing twice)
    await elasticsearchService.indexEmail(email1);
    await elasticsearchService.indexEmail(email1);

    // Refresh index to make documents instantly searchable
    await client.indices.refresh({ index: ELASTICSEARCH_EMAIL_INDEX });

    const searchAfterIndex = await elasticsearchService.searchEmails({
      userId: userA.id,
      query: 'alice.johnson@example.com',
    });

    console.log(`   ✅ Indexed email found in ES: total=${searchAfterIndex.total}`);
    if (searchAfterIndex.total !== 1) {
      throw new Error(`Expected exactly 1 document after idempotent indexing, got ${searchAfterIndex.total}`);
    }

    // Create additional test emails for User A
    const email2 = await emailService.createEmail(userA.id, campaignA.id, {
      recipientEmail: 'bob.smith@example.com',
      recipientName: 'Bob Smith',
      subject: 'Monthly Billing Statement',
      body: 'Your invoice for September is now available.',
      scheduledAt: new Date(),
    });

    const email3 = await emailService.createEmail(userA.id, campaignA.id, {
      recipientEmail: 'charlie.brown@example.com',
      recipientName: 'Charlie Brown',
      subject: 'Newsletter Alpha Issue #2',
      body: 'Detailed technical release notes.',
      scheduledAt: new Date(),
    });

    // Mark email2 as SENT in DB and update ES
    await prisma.email.update({
      where: { id: email2.id },
      data: { status: EmailStatus.SENT, sentAt: new Date() },
    });
    await elasticsearchService.updateEmailDocument(email2.id, {
      status: EmailStatus.SENT,
      sentAt: new Date().toISOString(),
    });

    // Create email for User B
    const emailB1 = await emailService.createEmail(userB.id, campaignB.id, {
      recipientEmail: 'secret.recipient@example.com',
      recipientName: 'Secret Recipient',
      subject: 'Confidential Internal Notice',
      body: 'Top secret data for User B only.',
      scheduledAt: new Date(),
    });
    await elasticsearchService.indexEmail(emailB1);

    await client.indices.refresh({ index: ELASTICSEARCH_EMAIL_INDEX });

    // C. TEST C: Full-Text Search (Recipient, Subject, Body)
    console.log('\n--- TEST C: Full-Text Search ---');
    const searchByRecipient = await elasticsearchService.searchEmails({
      userId: userA.id,
      query: 'bob.smith',
    });
    console.log(`   ✅ Search by Recipient 'bob.smith': ${searchByRecipient.total} hit(s)`);
    if (searchByRecipient.total === 0) throw new Error('Search by recipient failed');

    const searchBySubject = await elasticsearchService.searchEmails({
      userId: userA.id,
      query: 'Billing Statement',
    });
    console.log(`   ✅ Search by Subject 'Billing Statement': ${searchBySubject.total} hit(s)`);
    if (searchBySubject.total === 0) throw new Error('Search by subject failed');

    const searchByBody = await elasticsearchService.searchEmails({
      userId: userA.id,
      query: 'discount code',
    });
    console.log(`   ✅ Search by Body 'discount code': ${searchByBody.total} hit(s)`);
    if (searchByBody.total === 0) throw new Error('Search by body failed');

    // D. TEST D: Status Filtering
    console.log('\n--- TEST D: Status Filtering ---');
    const searchSent = await elasticsearchService.searchEmails({
      userId: userA.id,
      status: EmailStatus.SENT,
    });
    console.log(`   ✅ Search with status=SENT: ${searchSent.total} hit(s)`);
    if (searchSent.total !== 1 || searchSent.results[0]?.id !== email2.id) {
      throw new Error(`Expected 1 SENT email (${email2.id}), got ${searchSent.total}`);
    }

    const searchScheduled = await elasticsearchService.searchEmails({
      userId: userA.id,
      status: EmailStatus.SCHEDULED,
    });
    console.log(`   ✅ Search with status=SCHEDULED: ${searchScheduled.total} hit(s)`);
    if (searchScheduled.total !== 2) {
      throw new Error(`Expected 2 SCHEDULED emails for User A, got ${searchScheduled.total}`);
    }

    // E. TEST E: Pagination
    console.log('\n--- TEST E: Pagination ---');
    const page1 = await elasticsearchService.searchEmails({
      userId: userA.id,
      page: 1,
      limit: 2,
    });
    console.log(`   ✅ Page 1 (limit 2): results=${page1.results.length}, totalPages=${page1.totalPages}`);
    if (page1.results.length !== 2 || page1.totalPages !== 2) {
      throw new Error(`Expected page 1 with limit 2 to return 2 items out of 3 total`);
    }

    const page2 = await elasticsearchService.searchEmails({
      userId: userA.id,
      page: 2,
      limit: 2,
    });
    console.log(`   ✅ Page 2 (limit 2): results=${page2.results.length}`);
    if (page2.results.length !== 1) {
      throw new Error(`Expected page 2 with limit 2 to return 1 item`);
    }

    // F. TEST F: User Isolation
    console.log('\n--- TEST F: User Isolation ---');
    const userASearchForB = await elasticsearchService.searchEmails({
      userId: userA.id,
      query: 'Confidential Internal Notice',
    });
    console.log(`   ✅ User A search for User B's email title: ${userASearchForB.total} hit(s)`);
    if (userASearchForB.total !== 0) {
      throw new Error(`User Isolation Failure! User A retrieved ${userASearchForB.total} email(s) belonging to User B`);
    }

    const userBSearch = await elasticsearchService.searchEmails({
      userId: userB.id,
      query: 'Confidential',
    });
    console.log(`   ✅ User B search for own email: ${userBSearch.total} hit(s)`);
    if (userBSearch.total !== 1) {
      throw new Error('User B could not search their own emails');
    }

    // H. TEST H: Elasticsearch Failure Tolerance
    console.log('\n--- TEST H: Elasticsearch Failure Tolerance ---');
    // Ensure indexEmail handles missing or invalid ES host gracefully without throwing
    const originalHost = process.env.ELASTICSEARCH_URL;
    process.env.ELASTICSEARCH_URL = 'http://localhost:99999'; // Invalid host

    try {
      await elasticsearchService.updateEmailDocument('invalid-id', { status: 'TEST' });
      console.log('   ✅ ES update safely swallowed connection error without crashing application flow');
    } finally {
      process.env.ELASTICSEARCH_URL = originalHost;
    }

    console.log('\n====================================================');
    console.log('🎉 ALL STEP 5.2 ELASTICSEARCH TESTS PASSED!');
    console.log('====================================================\n');
  } catch (error) {
    console.error('❌ Step 5.2 Elasticsearch Test Suite Failed:', error);
    process.exitCode = 1;
  } finally {
    await closeEmailWorker().catch(() => {});
    await closeEmailQueue().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    await closeRedisClient().catch(() => {});
    await closeElasticsearchClient().catch(() => {});
  }
}

runElasticsearchSearchTests();
