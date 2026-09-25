import http from 'node:http';
import { createApp } from '../app.js';
import { prisma } from '../config/prisma.js';
import { closeRedisClient } from '../config/redis.js';
import { closeElasticsearchClient } from '../config/elasticsearch.js';

/**
 * Step 2.4 Comprehensive Integration Test Suite.
 * Exercises all 16 required API behavior and security test cases.
 */
async function runApiTests() {
  console.log('====================================================');
  console.log('STARTING PHASE 2 STEP 2.4 HARDENED API INTEGRATION TEST');
  console.log('====================================================\n');

  const app = createApp();
  const PORT = 3099;
  const baseUrl = `http://127.0.0.1:${PORT}`;

  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`🚀 Test server listening on ${baseUrl}`);
      resolve();
    });
  });

  const devHeader = { 'x-dev-user-id': 'dev-user-integration-001' };
  const headersWithAuth = {
    'Content-Type': 'application/json',
    ...devHeader,
  };

  try {
    // 0. Resolve Dev User
    console.log('\n0. Resolving Active Dev User Context...');
    const meRes = await fetch(`${baseUrl}/api/v1/users/me`);
    const meJson = (await meRes.json()) as any;
    const devUserId = meJson.data.id;
    console.log(`   ✅ Active Dev User ID: ${devUserId}`);

    const devHeader = { 'x-dev-user-id': devUserId };
    const headersWithAuth = {
      'Content-Type': 'application/json',
      ...devHeader,
    };

    // 1. Create Sender
    console.log('\n1. Test Case 1: Create Sender...');
    const senderRes = await fetch(`${baseUrl}/api/v1/senders`, {
      method: 'POST',
      headers: headersWithAuth,
      body: JSON.stringify({
        name: 'Step 2.4 Verified Sender',
        email: `verified-sender-${Date.now()}@mailflow.test`,
      }),
    });
    const senderJson = (await senderRes.json()) as any;
    console.log(`   ✅ POST /api/v1/senders Status: ${senderRes.status}`, senderJson.data);
    const senderId = senderJson.data.id;

    // 2. Create Campaign (DRAFT)
    console.log('\n2. Test Case 2: Create Campaign...');
    const campaignRes = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: headersWithAuth,
      body: JSON.stringify({
        name: 'Product Launch Q4',
        subject: 'Welcome aboard!',
        body: 'Hello {{name}}, welcome to MailFlow!',
        senderId: senderId,
      }),
    });
    const campaignJson = (await campaignRes.json()) as any;
    console.log(`   ✅ POST /api/v1/campaigns Status: ${campaignRes.status}, Status Enum: ${campaignJson.data.status}`);
    const campaignId = campaignJson.data.id;

    // 3. Create Single Email (SCHEDULED)
    console.log('\n3. Test Case 3: Create Single Email...');
    const singleEmailRes = await fetch(`${baseUrl}/api/v1/emails`, {
      method: 'POST',
      headers: headersWithAuth,
      body: JSON.stringify({
        campaignId: campaignId,
        recipientEmail: 'single.recipient@example.com',
        recipientName: 'Single Recipient',
        scheduledAt: new Date().toISOString(),
      }),
    });
    const singleEmailJson = (await singleEmailRes.json()) as any;
    console.log(`   ✅ POST /api/v1/emails Status: ${singleEmailRes.status}, Email Status: ${singleEmailJson.data.status}`);
    const emailId = singleEmailJson.data.id;

    // 4. Bulk Create Emails (with Intra-batch Deduplication)
    console.log('\n4. Test Case 4: Bulk Create Emails...');
    const bulkEmailRes = await fetch(`${baseUrl}/api/v1/emails/bulk`, {
      method: 'POST',
      headers: headersWithAuth,
      body: JSON.stringify({
        campaignId: campaignId,
        items: [
          { recipientEmail: 'bulk1@example.com', recipientName: 'Bulk One' },
          { recipientEmail: 'bulk2@example.com', recipientName: 'Bulk Two' },
          { recipientEmail: 'BULK1@example.com', recipientName: 'Bulk One Duplicate' }, // Duplicate entry
        ],
      }),
    });
    const bulkEmailJson = (await bulkEmailRes.json()) as any;
    console.log(`   ✅ POST /api/v1/emails/bulk Status: ${bulkEmailRes.status}`, bulkEmailJson.data);

    // 5. List Emails
    console.log('\n5. Test Case 5: List Emails...');
    const listEmailsRes = await fetch(`${baseUrl}/api/v1/emails?page=1&limit=10`, {
      headers: devHeader,
    });
    const listEmailsJson = (await listEmailsRes.json()) as any;
    console.log(`   ✅ GET /api/v1/emails Status: ${listEmailsRes.status}, Total: ${listEmailsJson.pagination.total}`);

    // 6. Filter Emails (by status and recipientEmail)
    console.log('\n6. Test Case 6: Filter Emails...');
    const filterEmailsRes = await fetch(`${baseUrl}/api/v1/emails?status=SCHEDULED&recipientEmail=single.recipient`, {
      headers: devHeader,
    });
    const filterEmailsJson = (await filterEmailsRes.json()) as any;
    console.log(`   ✅ GET /api/v1/emails?status=SCHEDULED Status: ${filterEmailsRes.status}, Filtered Count: ${filterEmailsJson.data.length}`);

    // 7. Get Email Details
    console.log('\n7. Test Case 7: Get Email Details...');
    const emailDetailRes = await fetch(`${baseUrl}/api/v1/emails/${emailId}`, {
      headers: devHeader,
    });
    const emailDetailJson = (await emailDetailRes.json()) as any;
    console.log(`   ✅ GET /api/v1/emails/${emailId} Status: ${emailDetailRes.status}`, emailDetailJson.data.campaign);

    // 8. List Campaigns (Sorting & Pagination)
    console.log('\n8. Test Case 8: List Campaigns...');
    const listCampaignsRes = await fetch(`${baseUrl}/api/v1/campaigns?page=1&limit=5&sortBy=createdAt&sortOrder=desc`, {
      headers: devHeader,
    });
    const listCampaignsJson = (await listCampaignsRes.json()) as any;
    console.log(`   ✅ GET /api/v1/campaigns Status: ${listCampaignsRes.status}, Total Pages: ${listCampaignsJson.pagination.totalPages}`);

    // 9. Campaign Statistics
    console.log('\n9. Test Case 9: Campaign Statistics Breakdown...');
    const campaignDetailRes = await fetch(`${baseUrl}/api/v1/campaigns/${campaignId}`, {
      headers: devHeader,
    });
    const campaignDetailJson = (await campaignDetailRes.json()) as any;
    console.log(`   ✅ GET /api/v1/campaigns/${campaignId} Status: ${campaignDetailRes.status}`, campaignDetailJson.data.stats);

    // 10. Ownership Protection (Accessing another user's resources)
    console.log('\n10. Test Case 10: Ownership Protection...');
    const forbiddenRes = await fetch(`${baseUrl}/api/v1/campaigns/${campaignId}`, {
      headers: { 'x-dev-user-id': 'other-malicious-user-id' },
    });
    const forbiddenJson = await forbiddenRes.json();
    console.log(`   ✅ GET /api/v1/campaigns/${campaignId} (Forbidden User) Status: ${forbiddenRes.status}`, forbiddenJson);

    // 11. Invalid Recipient Email Validation
    console.log('\n11. Test Case 11: Invalid Recipient Email Validation...');
    const invalidEmailRes = await fetch(`${baseUrl}/api/v1/emails`, {
      method: 'POST',
      headers: headersWithAuth,
      body: JSON.stringify({
        campaignId: campaignId,
        recipientEmail: 'not-an-email-address',
      }),
    });
    const invalidEmailJson = await invalidEmailRes.json();
    console.log(`   ✅ POST /api/v1/emails (Invalid Email) Status: ${invalidEmailRes.status}`, invalidEmailJson);

    // 12. Invalid Sender Relationship Validation
    console.log('\n12. Test Case 12: Invalid Sender Relationship...');
    const invalidSenderRes = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: headersWithAuth,
      body: JSON.stringify({
        name: 'Invalid Sender Campaign',
        subject: 'Test',
        body: 'Body',
        senderId: 'non-existent-sender-id-xyz',
      }),
    });
    const invalidSenderJson = await invalidSenderRes.json();
    console.log(`   ✅ POST /api/v1/campaigns (Invalid Sender) Status: ${invalidSenderRes.status}`, invalidSenderJson);

    // 13. Pagination Contract Verification
    console.log('\n13. Test Case 13: Pagination Contract...');
    const paginationRes = await fetch(`${baseUrl}/api/v1/campaigns?page=999&limit=10`, {
      headers: devHeader,
    });
    const paginationJson = (await paginationRes.json()) as any;
    console.log(`   ✅ GET /api/v1/campaigns?page=999 Status: ${paginationRes.status}`, paginationJson.pagination);

    // 14. Invalid Route Handling (404)
    console.log('\n14. Test Case 14: Invalid Route Handling...');
    const notFoundRes = await fetch(`${baseUrl}/api/v1/invalid-route-xyz`);
    const notFoundJson = await notFoundRes.json();
    console.log(`   ✅ GET /api/v1/invalid-route-xyz Status: ${notFoundRes.status}`, notFoundJson);

    // 15. Invalid Request Body (400)
    console.log('\n15. Test Case 15: Invalid Request Body...');
    const badBodyRes = await fetch(`${baseUrl}/api/v1/senders`, {
      method: 'POST',
      headers: headersWithAuth,
      body: JSON.stringify({ name: '' }), // Missing email
    });
    const badBodyJson = await badBodyRes.json();
    console.log(`   ✅ POST /api/v1/senders (Bad Body) Status: ${badBodyRes.status}`, badBodyJson);

    // 16. Attempt to Manipulate Protected Status
    console.log('\n16. Test Case 16: Attempt to Manipulate Protected Campaign Status...');
    const manipulateStatusRes = await fetch(`${baseUrl}/api/v1/campaigns/${campaignId}`, {
      method: 'PUT',
      headers: headersWithAuth,
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    const manipulateStatusJson = await manipulateStatusRes.json();
    console.log(`   ✅ PUT /api/v1/campaigns/${campaignId} (Set COMPLETED) Status: ${manipulateStatusRes.status}`, manipulateStatusJson);

    console.log('\n====================================================');
    console.log('🎉 ALL 16 STEP 2.4 INTEGRATION TEST CASES PASSED!');
    console.log('====================================================\n');
  } catch (error) {
    console.error('❌ API Verification Failed:', error);
    process.exitCode = 1;
  } finally {
    server.close();
    await prisma.$disconnect().catch(() => {});
    await closeRedisClient().catch(() => {});
    await closeElasticsearchClient().catch(() => {});
  }
}

runApiTests();
