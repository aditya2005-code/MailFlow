import { verifySmtpConnection } from '../config/smtp.js';

/**
 * Lightweight test utility to verify Ethereal SMTP server connectivity and authentication.
 * Does NOT send any emails.
 */
async function testSmtpConnection() {
  console.log('====================================================');
  console.log('STARTING ETHEREAL SMTP CONNECTIVITY TEST');
  console.log('====================================================\n');

  console.log('Connecting and verifying SMTP credentials...');
  const result = await verifySmtpConnection();

  if (result.success) {
    console.log(`\n   ✅ ${result.message}`);
    console.log('\n====================================================');
    console.log('🎉 SMTP CONNECTIVITY TEST PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
  } else {
    console.error(`\n   ❌ ${result.message}`);
    process.exitCode = 1;
  }
}

testSmtpConnection();
