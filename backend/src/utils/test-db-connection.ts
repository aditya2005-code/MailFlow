import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';

async function testConnection() {
  console.log('\n--- Neon PostgreSQL Connection Test ---');
  
  if (!env.DATABASE_URL || env.DATABASE_URL.includes('user:password@localhost')) {
    console.log('⚠️  DATABASE_URL is set to placeholder local URL.');
    console.log('👉 Please paste your actual Neon PostgreSQL connection string into backend/.env:');
    console.log('   DATABASE_URL="postgresql://user:password@ep-xyz.region.aws.neon.tech/neondb?sslmode=require"\n');
    process.exit(1);
  }

  console.log('Connecting to Neon PostgreSQL database...');
  try {
    const result = await prisma.$queryRaw<Array<{ connected: number; current_time: Date; version: string }>>`
      SELECT 1 as connected, NOW() as current_time, version() as version;
    `;
    console.log('✅ Connected to Neon PostgreSQL successfully!');
    console.log('Database Info:', result[0]);
  } catch (error) {
    console.error('❌ Connection failed!');
    if (error instanceof Error) {
      console.error('Error:', error.message);
    } else {
      console.error('Error:', error);
    }
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
