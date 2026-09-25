import nodemailer, { Transporter } from 'nodemailer';
import { env } from './env.js';

/**
 * Creates a reusable Nodemailer transporter connected to Ethereal SMTP.
 * Credentials are read exclusively from environment variables.
 */
export function createSmtpTransporter(): Transporter {
  const host = env.ETHEREAL_HOST || 'smtp.ethereal.email';
  const port = env.ETHEREAL_PORT || 587;
  const user = env.ETHEREAL_USER;
  const pass = env.ETHEREAL_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      '[smtp] Ethereal SMTP credentials (ETHEREAL_USER, ETHEREAL_PASSWORD) are missing from configuration.',
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for port 465, false for 587/25
    auth: {
      user,
      pass,
    },
    // Production/Dev timeout configurations
    connectionTimeout: 10000, // 10s
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

let smtpTransporterInstance: Transporter | null = null;

/**
 * Get or initialize a singleton Nodemailer SMTP transporter instance.
 */
export function getSmtpTransporter(): Transporter {
  if (!smtpTransporterInstance) {
    smtpTransporterInstance = createSmtpTransporter();
  }
  return smtpTransporterInstance;
}

/**
 * Verifies Ethereal SMTP server connection and authentication without sending emails.
 */
export async function verifySmtpConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const transporter = getSmtpTransporter();
    await transporter.verify();
    return {
      success: true,
      message: `Successfully authenticated with SMTP server (${env.ETHEREAL_HOST || 'smtp.ethereal.email'})`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `SMTP connection verification failed: ${errorMessage}`,
    };
  }
}
