import { prisma } from '../config/prisma.js';
import { slackConnectionService } from '../services/slackConnectionService.js';
import { slackConnectionRepository } from '../repositories/slackConnectionRepository.js';
import { getRedisClient, closeRedisClient } from '../config/redis.js';
import { env } from '../config/env.js';

async function runSlackTests() {
  console.log('--- Starting Slack OAuth & Notification Tests ---');

  // Backup original global fetch
  const originalFetch = global.fetch;

  try {
    // 0. Setup Test User
    const testUser = await prisma.user.upsert({
      where: { googleId: 'test-slack-google-id-999' },
      update: {},
      create: {
        googleId: 'test-slack-google-id-999',
        email: 'slack.testuser@mailflow.local',
        name: 'Slack Test User',
      },
    });

    console.log(`👤 Test User created/retrieved: ${testUser.email} (ID: ${testUser.id})`);

    // Clean up any existing Slack connections for test user
    await prisma.slackConnection.deleteMany({ where: { userId: testUser.id } });

    // ----------------------------------------------------------------------------------
    // TEST A: Slack OAuth authorization URL generation
    // ----------------------------------------------------------------------------------
    console.log('\n--- Test A: Slack OAuth Authorization URL ---');
    const { url, state } = await slackConnectionService.getSlackAuthUrl(testUser.id);

    if (!url.includes('https://slack.com/oauth/v2/authorize')) {
      throw new Error(`Test A Failed: Base URL incorrect (${url})`);
    }
    if (!url.includes('scope=incoming-webhook')) {
      throw new Error('Test A Failed: Missing scope=incoming-webhook in URL');
    }
    if (!url.includes(`state=${state}`)) {
      throw new Error('Test A Failed: Missing state in URL');
    }

    const redis = getRedisClient();
    const storedUserId = await redis.get(`mailflow:slack:state:${state}`);
    if (storedUserId !== testUser.id) {
      throw new Error(`Test A Failed: State not correctly stored in Redis for user ${testUser.id}`);
    }
    console.log('✅ Test A Passed: Valid Slack OAuth authorization URL generated with state stored in Redis.');

    // ----------------------------------------------------------------------------------
    // TEST B: Successful OAuth callback
    // ----------------------------------------------------------------------------------
    console.log('\n--- Test B: Successful OAuth Callback ---');
    const mockCode = 'mock_slack_auth_code_123';
    const mockTeamId = 'T12345678';
    const mockTeamName = 'MailFlow Workspace';
    const mockWebhookUrl = 'https://hooks.slack.com/services/T123/B456/mockSecretWebhook';

    // Mock global.fetch for Slack OAuth token exchange
    global.fetch = async (input: any, init?: any): Promise<Response> => {
      const urlStr = input.toString();
      if (urlStr.includes('slack.com/api/oauth.v2.access')) {
        return new Response(
          JSON.stringify({
            ok: true,
            app_id: 'A123',
            authed_user: { id: 'U123' },
            team: { id: mockTeamId, name: mockTeamName },
            incoming_webhook: {
              url: mockWebhookUrl,
              channel: '#general',
              configuration_url: 'https://mailflow.slack.com/services/123',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return originalFetch(input, init);
    };

    const connection = await slackConnectionService.handleOAuthCallback(mockCode, state);

    if (connection.userId !== testUser.id) {
      throw new Error('Test B Failed: Connection user ID does not match test user');
    }
    if (connection.teamId !== mockTeamId || connection.webhookUrl !== mockWebhookUrl) {
      throw new Error('Test B Failed: Team ID or Webhook URL stored incorrectly');
    }

    // Verify single-use state deletion
    const deletedState = await redis.get(`mailflow:slack:state:${state}`);
    if (deletedState) {
      throw new Error('Test B Failed: State token was not deleted after callback exchange');
    }
    console.log('✅ Test B Passed: OAuth code successfully exchanged and Slack connection created.');

    // ----------------------------------------------------------------------------------
    // TEST C: Reconnect / Existing Connection Update
    // ----------------------------------------------------------------------------------
    console.log('\n--- Test C: Reconnect Updates Existing Connection ---');
    const state2 = 'state_reconnect_test_456';
    await redis.set(`mailflow:slack:state:${state2}`, testUser.id, 'EX', 600);

    const updatedTeamName = 'MailFlow Workspace (Updated)';
    const updatedWebhookUrl = 'https://hooks.slack.com/services/T123/B456/newWebhookUrl';

    global.fetch = async (input: any, init?: any): Promise<Response> => {
      const urlStr = input.toString();
      if (urlStr.includes('slack.com/api/oauth.v2.access')) {
        return new Response(
          JSON.stringify({
            ok: true,
            team: { id: mockTeamId, name: updatedTeamName },
            incoming_webhook: { url: updatedWebhookUrl },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return originalFetch(input, init);
    };

    const reconnected = await slackConnectionService.handleOAuthCallback('mock_code_2', state2);
    const userConnections = await slackConnectionRepository.findByUserId(testUser.id);

    if (userConnections.length !== 1) {
      throw new Error(`Test C Failed: Expected 1 connection row, found ${userConnections.length}`);
    }
    if (reconnected.teamName !== updatedTeamName || reconnected.webhookUrl !== updatedWebhookUrl) {
      throw new Error('Test C Failed: Connection fields were not updated on reconnect');
    }
    console.log('✅ Test C Passed: Reconnecting Slack updated existing connection without creating duplicate rows.');

    // ----------------------------------------------------------------------------------
    // TEST D: Invalid State Protection
    // ----------------------------------------------------------------------------------
    console.log('\n--- Test D: Invalid or Expired State Rejection ---');
    let stateRejected = false;
    try {
      await slackConnectionService.handleOAuthCallback('some_code', 'invalid_expired_state_999');
    } catch (err: any) {
      stateRejected = true;
    }

    if (!stateRejected) {
      throw new Error('Test D Failed: OAuth callback did not reject invalid state');
    }
    console.log('✅ Test D Passed: Callback with invalid/expired state correctly rejected.');

    // ----------------------------------------------------------------------------------
    // TEST E: Slack Status Security (No Webhook URL exposed)
    // ----------------------------------------------------------------------------------
    console.log('\n--- Test E: Safe Slack Status Response ---');
    const status = await slackConnectionService.getStatus(testUser.id);

    if (!status.connected || status.teamName !== updatedTeamName) {
      throw new Error('Test E Failed: Slack status connected flag or teamName mismatch');
    }
    if ('webhookUrl' in (status as any) || 'clientSecret' in (status as any)) {
      throw new Error('Test E Failed: Webhook URL or secret was exposed in status response!');
    }
    console.log('✅ Test E Passed: Safe connection status returned without exposing webhook URL or secrets.');

    // ----------------------------------------------------------------------------------
    // TEST F: Disconnect
    // ----------------------------------------------------------------------------------
    console.log('\n--- Test F: Slack Disconnect ---');
    await slackConnectionService.disconnect(testUser.id);

    const postDisconnectStatus = await slackConnectionService.getStatus(testUser.id);
    if (postDisconnectStatus.connected !== false) {
      throw new Error('Test F Failed: User still reported connected after disconnect');
    }

    // Test calling disconnect again when no connection exists (should handle safely)
    await slackConnectionService.disconnect(testUser.id);
    console.log('✅ Test F Passed: Disconnect successfully removed connection and handled missing connection safely.');

    // ----------------------------------------------------------------------------------
    // TEST G: Rate-limit Notification Delivery
    // ----------------------------------------------------------------------------------
    console.log('\n--- Test G: Rate-limit Slack Notification ---');
    // Re-create connection with a test webhook URL
    await slackConnectionRepository.create({
      userId: testUser.id,
      teamId: mockTeamId,
      teamName: mockTeamName,
      webhookUrl: 'https://hooks.slack.com/services/test/notification/webhook',
    });

    // Clear any previous deduplication key in Redis
    const currentWindowStr = new Date().toISOString().slice(0, 13).replace(/[-T]/g, '');
    await redis.del(`mailflow:slack:dedup:${testUser.id}:${currentWindowStr}`);

    let webhookPayload: any = null;
    let webhookCallCount = 0;

    global.fetch = async (input: any, init?: any): Promise<Response> => {
      const urlStr = input.toString();
      if (urlStr.includes('hooks.slack.com/services/test/notification/webhook')) {
        webhookCallCount++;
        webhookPayload = JSON.parse(init?.body as string);
        return new Response('ok', { status: 200 });
      }
      return originalFetch(input, init);
    };

    const notifSent = await slackConnectionService.notifyRateLimitExceeded(testUser.id, {
      rateLimitValue: 100,
      nextAvailableTimeMs: Date.now() + 3600000,
    });

    if (!notifSent || webhookCallCount !== 1) {
      throw new Error('Test G Failed: Notification was not sent to Slack webhook');
    }
    if (!webhookPayload?.text?.includes('rate limit reached')) {
      throw new Error('Test G Failed: Webhook payload text missing rate limit notification');
    }
    console.log('✅ Test G Passed: Real rate-limit notification sent to Slack webhook.');

    // ----------------------------------------------------------------------------------
    // TEST H: Notification Deduplication
    // ----------------------------------------------------------------------------------
    console.log('\n--- Test H: Redis Notification Deduplication ---');
    const secondCallResult = await slackConnectionService.notifyRateLimitExceeded(testUser.id, {
      rateLimitValue: 100,
      nextAvailableTimeMs: Date.now() + 3600000,
    });

    if (secondCallResult !== false) {
      throw new Error('Test H Failed: Second notification in same window was not suppressed!');
    }
    if (webhookCallCount !== 1) {
      throw new Error(`Test H Failed: Webhook called ${webhookCallCount} times, expected 1`);
    }
    console.log('✅ Test H Passed: Distributed Redis deduplication prevented duplicate Slack notifications in same window.');

    // ----------------------------------------------------------------------------------
    // TEST I: Slack Failure Resilience (Worker must not break)
    // ----------------------------------------------------------------------------------
    console.log('\n--- Test I: Slack Webhook Failure Resilience ---');
    const failUser = await prisma.user.upsert({
      where: { googleId: 'test-slack-failing-user-id' },
      update: {},
      create: {
        googleId: 'test-slack-failing-user-id',
        email: 'slack.failing@mailflow.local',
        name: 'Failing Webhook User',
      },
    });
    const newTestUserId = failUser.id;
    await prisma.slackConnection.deleteMany({ where: { userId: newTestUserId } });
    await redis.del(`mailflow:slack:dedup:${newTestUserId}:${currentWindowStr}`);

    await slackConnectionRepository.create({
      userId: newTestUserId,
      teamId: 'TFAIL',
      teamName: 'Failing Slack Team',
      webhookUrl: 'https://hooks.slack.com/services/test/failing/webhook',
    });

    global.fetch = async (input: any): Promise<Response> => {
      if (input.toString().includes('failing/webhook')) {
        throw new Error('Network Connection Refused (Simulated Slack Webhook Down)');
      }
      return originalFetch(input);
    };

    // Should return false gracefully without throwing an exception or crashing
    const failResult = await slackConnectionService.notifyRateLimitExceeded(newTestUserId, {
      rateLimitValue: 100,
      nextAvailableTimeMs: Date.now() + 3600000,
    });

    if (failResult !== false) {
      throw new Error('Test I Failed: Expected false return value on webhook failure');
    }
    console.log('✅ Test I Passed: Slack webhook failure handled gracefully without crashing or throwing errors.');

    // Clean up test data
    await prisma.slackConnection.deleteMany({ where: { userId: { in: [testUser.id, newTestUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [testUser.id, newTestUserId] } } });

    console.log('✅ Slack OAuth & Notification Tests Completed Successfully!');
  } finally {
    global.fetch = originalFetch;
    await closeRedisClient();
    await prisma.$disconnect();
    process.exit(0);
  }
}

runSlackTests().catch((err) => {
  console.error('\n❌ Slack Test Runner Error:', err);
  process.exit(1);
});
