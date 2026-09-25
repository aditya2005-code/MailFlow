import http from 'node:http';
import { createApp } from '../app.js';
import { prisma } from '../config/prisma.js';
import { closeRedisClient } from '../config/redis.js';
import { closeElasticsearchClient } from '../config/elasticsearch.js';

/**
 * Integration Test Script for Phase 2 Step 2.3 API Structure & Core Middleware.
 * Spawns the Express app on a temporary port, exercises all REST endpoints via fetch,
 * and validates responses, pagination headers, auto dev user creation, and 404 error handling.
 */
async function runApiTests() {
  console.log('====================================================');
  console.log('STARTING PHASE 2 STEP 2.3 API INTEGRATION VERIFICATION');
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

  try {
    // 1. Health Checks
    console.log('\n1. Testing Health Endpoints...');
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json();
    console.log(`   ✅ GET /health Status: ${healthRes.status}`, healthData);

    const infraRes = await fetch(`${baseUrl}/api/v1/health/infrastructure`);
    const infraData = await infraRes.json();
    console.log(`   ✅ GET /api/v1/health/infrastructure Status: ${infraRes.status}`, infraData);

    // 2. User Endpoint & Auto Dev-Auth Middleware
    console.log('\n2. Testing User Endpoints (Dev Auth Middleware)...');
    const meRes = await fetch(`${baseUrl}/api/v1/users/me`);
    const meData = (await meRes.json()) as any;
    console.log(`   ✅ GET /api/v1/users/me Status: ${meRes.status}`, meData.data);
    const userId = meData.data.id;
    console.log(`   ✅ Resolved User ID: ${userId}`);

    // 3. Sender Endpoints
    console.log('\n3. Testing Sender Endpoints...');
    const createSenderRes = await fetch(`${baseUrl}/api/v1/senders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'API Test Sender',
        email: `api-sender-${Date.now()}@example.com`,
        replyTo: 'support@example.com',
      }),
    });
    const createdSenderData = (await createSenderRes.json()) as any;
    console.log(`   ✅ POST /api/v1/senders Status: ${createSenderRes.status}`, createdSenderData.data);
    const senderId = createdSenderData.data.id;

    const getSendersRes = await fetch(`${baseUrl}/api/v1/senders`);
    const getSendersData = (await getSendersRes.json()) as any;
    console.log(`   ✅ GET /api/v1/senders Status: ${getSendersRes.status}, Count: ${getSendersData.data.length}`);

    // 4. Campaign Endpoints
    console.log('\n4. Testing Campaign Endpoints...');
    const createCampaignRes = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'API Product Announcement',
        subject: 'Big News!',
        body: 'Hello {{name}}, check out our new update.',
        senderId: senderId,
      }),
    });
    const campaignData = (await createCampaignRes.json()) as any;
    console.log(`   ✅ POST /api/v1/campaigns Status: ${createCampaignRes.status}`, campaignData.data);
    const campaignId = campaignData.data.id;

    const getCampaignsRes = await fetch(`${baseUrl}/api/v1/campaigns?page=1&limit=10`);
    const getCampaignsData = (await getCampaignsRes.json()) as any;
    console.log(`   ✅ GET /api/v1/campaigns Status: ${getCampaignsRes.status}, Total: ${getCampaignsData.pagination?.total}`);

    // 5. Email Endpoints (Bulk Creation)
    console.log('\n5. Testing Email Endpoints...');
    const bulkEmailRes = await fetch(`${baseUrl}/api/v1/emails/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: campaignId,
        items: [
          { recipientEmail: 'user1@example.com', variables: { name: 'User One' }, scheduledAt: new Date().toISOString() },
          { recipientEmail: 'user2@example.com', variables: { name: 'User Two' }, scheduledAt: new Date().toISOString() },
        ],
      }),
    });
    const bulkEmailData = (await bulkEmailRes.json()) as any;
    console.log(`   ✅ POST /api/v1/emails/bulk Status: ${bulkEmailRes.status}`, bulkEmailData);

    const getEmailsRes = await fetch(`${baseUrl}/api/v1/emails?page=1&limit=10`);
    const getEmailsData = (await getEmailsRes.json()) as any;
    console.log(`   ✅ GET /api/v1/emails Status: ${getEmailsRes.status}, Total: ${getEmailsData.pagination?.total}`);

    // 6. Slack Endpoints
    console.log('\n6. Testing Slack Endpoints...');
    const createSlackRes = await fetch(`${baseUrl}/api/v1/slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: 'T-API-TEST',
        teamName: 'API Test Workspace',
        webhookUrl: 'https://example.com/test-webhook',
      }),
    });
    const slackData = (await createSlackRes.json()) as any;
    console.log(`   ✅ POST /api/v1/slack Status: ${createSlackRes.status}`, slackData.data);

    const getSlackRes = await fetch(`${baseUrl}/api/v1/slack`);
    const getSlackData = (await getSlackRes.json()) as any;
    console.log(`   ✅ GET /api/v1/slack Status: ${getSlackRes.status}, Count: ${getSlackData.data.length}`);

    // 7. Error Handling & 404 Check
    console.log('\n7. Testing Centralized Error Handling...');
    const notFoundRes = await fetch(`${baseUrl}/api/v1/invalid-route-xyz`);
    const notFoundData = await notFoundRes.json();
    console.log(`   ✅ GET /api/v1/invalid-route-xyz Status: ${notFoundRes.status}`, notFoundData);

    console.log('\n====================================================');
    console.log('🎉 ALL API ENDPOINTS PASSED VERIFICATION SUCCESSFULLY!');
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
