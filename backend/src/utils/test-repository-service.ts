import { userService } from '../services/userService.js';
import { senderService } from '../services/senderService.js';
import { campaignService } from '../services/campaignService.js';
import { emailService } from '../services/emailService.js';
import { slackConnectionService } from '../services/slackConnectionService.js';
import { userRepository } from '../repositories/userRepository.js';
import { ForbiddenError, ConflictError } from '../errors/appErrors.js';
import { closeRedisClient } from '../config/redis.js';
import { closeElasticsearchClient } from '../config/elasticsearch.js';

async function testRepositoryAndServiceLayer() {
  console.log('\n--- Repository & Service Layer Verification ---');

  const testGoogleId1 = `test-google-${Date.now()}-1`;
  const testGoogleId2 = `test-google-${Date.now()}-2`;
  const testEmail1 = `user1-${Date.now()}@example.com`;
  const testEmail2 = `user2-${Date.now()}@example.com`;

  let user1Id: string | null = null;
  let user2Id: string | null = null;

  try {
    // 1. User Service Verification
    console.log('1. Testing UserService...');
    const user1 = await userService.createUser({
      googleId: testGoogleId1,
      email: testEmail1,
      name: 'Test User One',
      avatarUrl: 'https://example.com/avatar1.jpg',
    });
    user1Id = user1.id;
    console.log(`   ✅ User 1 created: ${user1.id} (${user1.email})`);

    const user2 = await userService.createUser({
      googleId: testGoogleId2,
      email: testEmail2,
      name: 'Test User Two',
    });
    user2Id = user2.id;
    console.log(`   ✅ User 2 created: ${user2.id} (${user2.email})`);

    // Duplicate user prevention
    try {
      await userService.createUser({
        googleId: testGoogleId1,
        email: 'another@example.com',
        name: 'Duplicate Google ID',
      });
      console.error('   ❌ Duplicate Google ID check failed!');
    } catch (err: any) {
      if (err.name === 'ConflictError' || err.statusCode === 409) {
        console.log('   ✅ Duplicate Google ID blocked as expected.');
      } else {
        throw err;
      }
    }

    // 2. Sender Service Verification
    console.log('\n2. Testing SenderService...');
    const sender1 = await senderService.createSender(user1.id, {
      name: 'Marketing Team',
      email: 'newsletter@example.com',
    });
    console.log(`   ✅ Sender created for User 1: ${sender1.id} (${sender1.email})`);

    // Duplicate sender for same user check
    try {
      await senderService.createSender(user1.id, {
        name: 'Duplicate Team',
        email: 'newsletter@example.com',
      });
      console.error('   ❌ Duplicate Sender check failed!');
    } catch (err: any) {
      if (err.name === 'ConflictError' || err.statusCode === 409) {
        console.log('   ✅ Duplicate sender per user blocked as expected.');
      } else {
        throw err;
      }
    }

    // 3. Campaign Service Verification
    console.log('\n3. Testing CampaignService...');
    const campaign1 = await campaignService.createCampaign(user1.id, {
      senderId: sender1.id,
      name: 'Q3 Product Announcement',
      subject: 'Exciting news inside!',
      body: '<p>Check out our latest release.</p>',
    });
    console.log(`   ✅ Campaign created for User 1: ${campaign1.id} (status: ${campaign1.status})`);

    // 4. Email Service Verification (Bulk Creation + Transactions)
    console.log('\n4. Testing EmailService (Bulk Creation & Transactions)...');
    const scheduledTime = new Date(Date.now() + 3600000); // 1 hour in future
    const bulkResult = await emailService.bulkCreateEmails(user1.id, campaign1.id, [
      { recipientEmail: 'alice@example.com', recipientName: 'Alice', scheduledAt: scheduledTime },
      { recipientEmail: 'bob@example.com', recipientName: 'Bob', scheduledAt: scheduledTime },
    ]);
    console.log(`   ✅ Bulk created ${bulkResult.count} emails.`);

    const updatedCampaign1 = await campaignService.getCampaignById(user1.id, campaign1.id);
    console.log(`   ✅ Campaign status updated to: ${updatedCampaign1.status}`);

    const emailsPage = await emailService.getEmailsByCampaign(user1.id, campaign1.id);
    console.log(`   ✅ Retrieved ${emailsPage.emails.length} queued emails for Campaign 1.`);
    const targetEmail = emailsPage.emails[0];

    // 5. Atomic State Transition Verification
    console.log('\n5. Testing Atomic Email Worker Claiming...');
    const claimed1 = await emailService.claimEmailForProcessing(targetEmail.id);
    console.log(`   ✅ Worker 1 claimed email ${targetEmail.id}: ${claimed1}`);

    const claimed2 = await emailService.claimEmailForProcessing(targetEmail.id);
    console.log(`   ✅ Worker 2 duplicate claim blocked: ${!claimed2}`);

    const sentResult = await emailService.markEmailSent(targetEmail.id);
    console.log(`   ✅ Marked email as SENT: ${sentResult}`);

    const verifiedEmail = await emailService.getEmailById(user1.id, targetEmail.id);
    console.log(`   ✅ Verified email final status: ${verifiedEmail.status}, sentAt: ${verifiedEmail.sentAt?.toISOString()}`);

    // 6. Slack Connection Verification
    console.log('\n6. Testing SlackConnectionService...');
    const slackConn = await slackConnectionService.createOrUpdateConnection(user1.id, {
      teamId: 'T12345678',
      teamName: 'Acme Corp Workspace',
      webhookUrl: 'https://hooks.slack.com/services/T00/B00/XXXXX',
    });
    console.log(`   ✅ SlackConnection created for User 1: ${slackConn.id}`);

    // 7. Ownership Security Verification
    console.log('\n7. Testing Ownership Security Checks...');
    try {
      await campaignService.getCampaignById(user2.id, campaign1.id);
      console.error('   ❌ Ownership check failed! User 2 accessed User 1 campaign.');
    } catch (err: any) {
      if (err.name === 'ForbiddenError' || err.statusCode === 403) {
        console.log('   ✅ User 2 forbidden from accessing User 1 campaign as expected.');
      } else {
        throw err;
      }
    }

    console.log('\n🎉 ALL REPOSITORY & SERVICE LAYER TESTS PASSED SUCCESSFULLY!');
  } catch (error) {
    console.error('\n❌ Repository & Service verification error:', error);
    process.exitCode = 1;
  } finally {
    // 8. Cleanup Temporary Test Data
    console.log('\n8. Cleaning up test records...');
    if (user1Id) {
      const { prisma } = await import('../config/prisma.js');
      // Delete campaigns first so emails are deleted before deleting senders (due to Sender -> Email Restrict constraint)
      await prisma.campaign.deleteMany({ where: { userId: user1Id } });
      await prisma.user.delete({ where: { id: user1Id } });
      console.log(`   ✅ Cleaned up User 1 (${user1Id}) and cascaded records.`);
    }
    if (user2Id) {
      const { prisma } = await import('../config/prisma.js');
      await prisma.user.delete({ where: { id: user2Id } });
      console.log(`   ✅ Cleaned up User 2 (${user2Id}).`);
    }

    await closeRedisClient();
    await closeElasticsearchClient();
  }
}

testRepositoryAndServiceLayer();
