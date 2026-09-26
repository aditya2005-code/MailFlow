import { prisma } from '../config/prisma.js';
import { closeRedisClient } from '../config/redis.js';
import { closeElasticsearchClient } from '../config/elasticsearch.js';
import { emailService } from '../services/emailService.js';
import { senderService } from '../services/senderService.js';
import { campaignService } from '../services/campaignService.js';
import { processEmailJob, closeEmailWorker, getEmailWorker } from '../workers/emailWorker.js';
import { closeEmailQueue, defaultEmailJobOptions } from '../queues/index.js';
import { EmailStatus } from '@prisma/client';
import { setSmtpTransporterOverride } from '../config/smtp.js';

/**
 * Delivery Reliability & Idempotency Test Suite.
 */
async function runReliabilityAndIdempotencyTests() {
  console.log('--- Starting Delivery Reliability & Idempotency Tests ---');

  try {
    // 0. Setup Context
    console.log('0. Setting up test database context...');
    const user = await prisma.user.upsert({
      where: { googleId: 'reliability-test-user-001' },
      update: {},
      create: {
        googleId: 'reliability-test-user-001',
        email: 'reliability.test@mailflow.local',
        name: 'Reliability Test User',
      },
    });

    const sender = await senderService.createSender(user.id, {
      name: 'Reliability Sender',
      email: `reliability-sender-${Date.now()}@example.com`,
    });

    const campaign = await campaignService.createCampaign(user.id, {
      name: 'Reliability Campaign',
      subject: 'Reliability Subject',
      body: '<p>Reliability Test Body</p>',
      senderId: sender.id,
    });

    // A. TEST A: Email in SENT state (No duplicate send)
    console.log('\n--- TEST A: Email in SENT state (Idempotency) ---');
    const sentEmail = await emailService.createEmail(user.id, campaign.id, {
      recipientEmail: 'sent.test@example.com',
      scheduledAt: new Date(),
    });
    // Mark as SENT in DB
    await prisma.email.update({
      where: { id: sentEmail.id },
      data: { status: EmailStatus.SENT, sentAt: new Date() },
    });

    const mockJobSent: any = {
      id: sentEmail.id,
      data: { emailId: sentEmail.id },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    const resultA = await processEmailJob(mockJobSent);
    console.log('   ✅ Test A Result:', resultA);
    if (resultA.status !== 'skipped' || resultA.reason !== 'already_sent') {
      throw new Error(`Expected skipped execution for SENT email, got ${JSON.stringify(resultA)}`);
    }

    // B. TEST B: Concurrent Processing (Atomic Claim)
    console.log('\n--- TEST B: Concurrent Processing (Atomic Claim) ---');
    const raceEmail = await emailService.createEmail(user.id, campaign.id, {
      recipientEmail: 'race.test@example.com',
      scheduledAt: new Date(),
    });

    // Worker 1 claims it (SCHEDULED -> PROCESSING)
    await prisma.email.update({
      where: { id: raceEmail.id },
      data: { status: EmailStatus.PROCESSING },
    });

    const mockJobRace: any = {
      id: raceEmail.id,
      data: { emailId: raceEmail.id },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    const resultB = await processEmailJob(mockJobRace);
    console.log('   ✅ Test B Result (Worker 2):', resultB);
    if (resultB.status !== 'skipped' || resultB.reason !== 'already_processing') {
      throw new Error(`Expected skipped execution for PROCESSING email, got ${JSON.stringify(resultB)}`);
    }

    // C. TEST C: Transient Failure Retry Behavior
    console.log('\n--- TEST C: Transient SMTP Failure & Retry ---');
    const retryEmail = await emailService.createEmail(user.id, campaign.id, {
      recipientEmail: 'retry.test@example.com',
      scheduledAt: new Date(),
    });

    const mockJobRetry: any = {
      id: retryEmail.id,
      data: { emailId: retryEmail.id },
      attemptsMade: 0, // Attempt 1 of 3
      opts: { attempts: 3 },
    };

    // Set custom mock transporter for transient failure
    setSmtpTransporterOverride({
      sendMail: async () => {
        throw new Error('Transient SMTP connection timeout (504)');
      },
    } as any);

    try {
      await processEmailJob(mockJobRetry);
      throw new Error('Expected processEmailJob to throw on transient SMTP failure');
    } catch (err: any) {
      console.log('   ✅ Transient failure threw error as expected:', err.message);
    } finally {
      setSmtpTransporterOverride(null);
    }

    const updatedRetryEmail = await emailService.getEmailById(user.id, retryEmail.id);
    console.log(
      `   ✅ Updated DB state after attempt 1: status=${updatedRetryEmail.status}, attempts=${updatedRetryEmail.attempts}, lastError="${updatedRetryEmail.lastError}"`,
    );

    if (updatedRetryEmail.status !== EmailStatus.SCHEDULED) {
      throw new Error(`Expected status 'SCHEDULED' for retryable email, got '${updatedRetryEmail.status}'`);
    }
    if (updatedRetryEmail.attempts !== 1) {
      throw new Error(`Expected attempts = 1, got ${updatedRetryEmail.attempts}`);
    }
    if (!updatedRetryEmail.lastError?.includes('Transient SMTP connection timeout')) {
      throw new Error(`Expected lastError to contain transient message, got '${updatedRetryEmail.lastError}'`);
    }

    // D. TEST D: Final Attempt Failure
    console.log('\n--- TEST D: Final Retry Failure (FAILED state) ---');
    const finalFailEmail = await emailService.createEmail(user.id, campaign.id, {
      recipientEmail: 'finalfail.test@example.com',
      scheduledAt: new Date(),
    });

    // Mark as PROCESSING (as if claimed on final attempt)
    await prisma.email.update({
      where: { id: finalFailEmail.id },
      data: { status: EmailStatus.PROCESSING },
    });

    const mockJobFinal: any = {
      id: finalFailEmail.id,
      data: { emailId: finalFailEmail.id },
      attemptsMade: 2, // Attempt 3 of 3 (Final)
      opts: { attempts: 3 },
    };

    // Set custom mock transporter for final failure
    setSmtpTransporterOverride({
      sendMail: async () => {
        throw new Error('Fatal SMTP authentication failure (535)');
      },
    } as any);

    try {
      await processEmailJob(mockJobFinal);
      throw new Error('Expected processEmailJob to throw on final SMTP failure');
    } catch (err: any) {
      console.log('   ✅ Final failure threw error as expected:', err.message);
    } finally {
      setSmtpTransporterOverride(null);
    }

    const updatedFinalFailEmail = await emailService.getEmailById(user.id, finalFailEmail.id);
    console.log(
      `   ✅ Updated DB state after final attempt: status=${updatedFinalFailEmail.status}, attempts=${updatedFinalFailEmail.attempts}, lastError="${updatedFinalFailEmail.lastError}"`,
    );

    if (updatedFinalFailEmail.status !== EmailStatus.FAILED) {
      throw new Error(`Expected status 'FAILED' on final attempt failure, got '${updatedFinalFailEmail.status}'`);
    }
    if (updatedFinalFailEmail.attempts !== 1) { // 1 increment
      throw new Error(`Expected attempts incremented, got ${updatedFinalFailEmail.attempts}`);
    }
    if (!updatedFinalFailEmail.lastError?.includes('Fatal SMTP authentication failure')) {
      throw new Error(`Expected lastError to contain fatal message, got '${updatedFinalFailEmail.lastError}'`);
    }

    // E. TEST E: Restart / Stalled Job Recovery Configuration
    console.log('\n--- TEST E: Queue & Worker Restart Recovery Configuration ---');
    const workerInstance = getEmailWorker();
    const opts = (workerInstance as any).opts;

    console.log(`   ✅ BullMQ defaultJobOptions attempts: ${defaultEmailJobOptions.attempts}`);
    console.log(`   ✅ BullMQ defaultJobOptions backoff:`, defaultEmailJobOptions.backoff);
    console.log(`   ✅ Worker lockDuration: ${opts?.lockDuration}ms`);
    console.log(`   ✅ Worker stalledInterval: ${opts?.stalledInterval}ms`);
    console.log(`   ✅ Worker maxStalledCount: ${opts?.maxStalledCount}`);

    if (defaultEmailJobOptions.attempts !== 3) {
      throw new Error('BullMQ default attempts is not 3');
    }
    if (opts?.lockDuration !== 30000 || opts?.stalledInterval !== 30000) {
      throw new Error('Worker stalled job lock configuration missing or incorrect');
    }

    console.log('✅ Reliability & Idempotency Tests Completed Successfully!');
  } catch (error) {
    console.error('❌ Reliability Test Suite Failed:', error);
    process.exitCode = 1;
  } finally {
    await closeEmailWorker().catch(() => {});
    await closeEmailQueue().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    await closeRedisClient().catch(() => {});
    await closeElasticsearchClient().catch(() => {});
  }
}

runReliabilityAndIdempotencyTests();
