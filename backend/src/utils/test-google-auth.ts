import { createApp } from '../app.js';
import http from 'http';
import { prisma } from '../config/prisma.js';
import { authService, AUTH_COOKIE_NAME } from '../services/authService.js';
import { senderService } from '../services/senderService.js';
import { campaignService } from '../services/campaignService.js';
import { closeRedisClient } from '../config/redis.js';
import { closeElasticsearchClient } from '../config/elasticsearch.js';

/**
 * Step 6.1 Google OAuth & JWT Authentication Integration Test Suite
 */
async function runGoogleAuthTests() {
  console.log('====================================================');
  console.log('STARTING STEP 6.1 GOOGLE OAUTH & JWT AUTH TESTS');
  console.log('====================================================\n');

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://localhost:${address.port}`;

  try {
    // A. TEST A: New Google User Upsert
    console.log('1. Test A: New Google User Upsert...');
    const googleIdA = `google-auth-user-A-${Date.now()}`;
    const userA = await authService.upsertGoogleUser({
      googleId: googleIdA,
      email: 'usera.oauth@example.com',
      name: 'User A OAuth',
      avatarUrl: 'https://example.com/avatarA.jpg',
    });

    console.log(`   ✅ Created User A in DB: id=${userA.id}, email=${userA.email}`);
    if (userA.googleId !== googleIdA) {
      throw new Error(`Expected googleId ${googleIdA}, got ${userA.googleId}`);
    }

    // B. TEST B: Existing Google User Reuse (No Duplicates)
    console.log('\n2. Test B: Existing Google User Reuse...');
    const updatedUserA = await authService.upsertGoogleUser({
      googleId: googleIdA,
      email: 'usera.oauth@example.com',
      name: 'User A Updated Name',
      avatarUrl: 'https://example.com/avatarA_new.jpg',
    });

    console.log(`   ✅ Reused User A: id=${updatedUserA.id}, name=${updatedUserA.name}`);
    if (updatedUserA.id !== userA.id) {
      throw new Error('Expected same User ID for existing Google account');
    }
    if (updatedUserA.name !== 'User A Updated Name') {
      throw new Error('Profile fields were not updated on existing user');
    }

    const totalUsersWithGoogleId = await prisma.user.count({ where: { googleId: googleIdA } });
    if (totalUsersWithGoogleId !== 1) {
      throw new Error(`Duplicate user records found for googleId ${googleIdA}`);
    }

    // C. TEST C: JWT Session Token & 401 Protection
    console.log('\n3. Test C: JWT Session Token & 401 Protection...');
    const tokenA = authService.generateToken(userA.id);

    // Unauthenticated request should fail with 401
    const unauthRes = await fetch(`${baseUrl}/api/v1/senders`);
    console.log(`   ✅ Unauthenticated GET /api/v1/senders Status: ${unauthRes.status}`);
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated request, got ${unauthRes.status}`);
    }

    // Request with valid Cookie
    const authResCookie = await fetch(`${baseUrl}/api/v1/senders`, {
      headers: {
        Cookie: `${AUTH_COOKIE_NAME}=${tokenA}`,
      },
    });
    console.log(`   ✅ Authenticated via Cookie GET /api/v1/senders Status: ${authResCookie.status}`);
    if (authResCookie.status !== 200) {
      throw new Error(`Expected 200 for cookie authenticated request, got ${authResCookie.status}`);
    }

    // Request with valid Authorization Bearer header
    const authResBearer = await fetch(`${baseUrl}/api/v1/senders`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
    });
    console.log(`   ✅ Authenticated via Bearer Header Status: ${authResBearer.status}`);
    if (authResBearer.status !== 200) {
      throw new Error(`Expected 200 for Bearer authenticated request, got ${authResBearer.status}`);
    }

    // D. TEST D: /api/auth/me Profile Endpoint
    console.log('\n4. Test D: GET /api/auth/me Endpoint...');
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Cookie: `${AUTH_COOKIE_NAME}=${tokenA}`,
      },
    });

    console.log(`   ✅ GET /api/auth/me Status: ${meRes.status}`);
    if (meRes.status !== 200) {
      throw new Error(`Expected 200 from /api/auth/me, got ${meRes.status}`);
    }

    const meBody = (await meRes.json()) as any;
    console.log('   ✅ User Profile Data:', meBody.data);
    if (meBody.data.id !== userA.id || meBody.data.email !== 'usera.oauth@example.com') {
      throw new Error('/api/auth/me returned incorrect profile details');
    }

    // E. TEST E: POST /api/auth/logout Endpoint
    console.log('\n5. Test E: POST /api/auth/logout Endpoint...');
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: `${AUTH_COOKIE_NAME}=${tokenA}`,
      },
    });

    console.log(`   ✅ POST /api/auth/logout Status: ${logoutRes.status}`);
    const setCookieHeader = logoutRes.headers.get('set-cookie');
    console.log(`   ✅ Set-Cookie header on logout: ${setCookieHeader}`);

    if (logoutRes.status !== 200) {
      throw new Error(`Expected 200 from /api/auth/logout, got ${logoutRes.status}`);
    }
    if (!setCookieHeader || !setCookieHeader.includes(`${AUTH_COOKIE_NAME}=;`)) {
      throw new Error('Logout did not clear the authentication cookie');
    }

    // F. TEST F: User Isolation Check
    console.log('\n6. Test F: User Isolation Check...');
    const googleIdB = `google-auth-user-B-${Date.now()}`;
    const userB = await authService.upsertGoogleUser({
      googleId: googleIdB,
      email: 'userb.oauth@example.com',
      name: 'User B OAuth',
    });
    const tokenB = authService.generateToken(userB.id);

    // User A creates a sender and campaign
    const senderA = await senderService.createSender(userA.id, {
      name: 'Private Sender A',
      email: `privatesenderA-${Date.now()}@example.com`,
    });
    const campaignA = await campaignService.createCampaign(userA.id, {
      name: 'Private Campaign A',
      subject: 'Private Subject A',
      body: 'Private Body A',
      senderId: senderA.id,
    });

    // User B attempts to access User A's campaign
    const forbiddenRes = await fetch(`${baseUrl}/api/v1/campaigns/${campaignA.id}`, {
      headers: {
        Cookie: `${AUTH_COOKIE_NAME}=${tokenB}`,
      },
    });

    console.log(`   ✅ User B GET User A Campaign Status: ${forbiddenRes.status}`);
    if (forbiddenRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for cross-tenant access, got ${forbiddenRes.status}`);
    }

    // G. TEST G: OAuth Error Handling
    console.log('\n7. Test G: OAuth Error Redirect Handling...');
    const callbackErrRes = await fetch(`${baseUrl}/api/auth/google/callback?error=access_denied`, {
      redirect: 'manual',
    });

    console.log(`   ✅ OAuth Error Callback Status: ${callbackErrRes.status}`);
    const locationHeader = callbackErrRes.headers.get('location');
    console.log(`   ✅ Redirect Location: ${locationHeader}`);

    if (callbackErrRes.status !== 302 || !locationHeader?.includes('error=oauth_failed')) {
      throw new Error('OAuth error callback did not redirect gracefully to frontend with error query');
    }

    console.log('\n====================================================');
    console.log('🎉 ALL STEP 6.1 GOOGLE OAUTH & JWT TESTS PASSED!');
    console.log('====================================================\n');
  } catch (error) {
    console.error('❌ Step 6.1 Auth Test Suite Failed:', error);
    process.exitCode = 1;
  } finally {
    server.close();
    await prisma.$disconnect().catch(() => {});
    await closeRedisClient().catch(() => {});
    await closeElasticsearchClient().catch(() => {});
  }
}

runGoogleAuthTests();
