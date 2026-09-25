import crypto from 'crypto';
import { SlackConnection } from '@prisma/client';
import {
  slackConnectionRepository,
  CreateSlackConnectionData,
  UpdateSlackConnectionData,
} from '../repositories/slackConnectionRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors/appErrors.js';
import { getRedisClient } from '../config/redis.js';
import { env } from '../config/env.js';
import { rateLimitService } from './rateLimitService.js';
import { z } from 'zod';

const webhookUrlSchema = z.string().url();

export interface SlackStatusResponse {
  connected: boolean;
  teamName?: string;
}

export const slackConnectionService = {
  /**
   * Generates Slack OAuth authorization URL and stores state in Redis for CSRF protection.
   */
  async getSlackAuthUrl(userId: string): Promise<{ url: string; state: string }> {
    const clientId = env.SLACK_CLIENT_ID || process.env.SLACK_CLIENT_ID || 'mock_slack_client_id';
    const redirectUri = env.SLACK_REDIRECT_URI || process.env.SLACK_REDIRECT_URI || 'http://localhost:5000/api/slack/callback';

    if (!clientId) {
      throw new ValidationError('SLACK_CLIENT_ID is not configured.');
    }

    const state = crypto.randomBytes(24).toString('hex');
    const redis = getRedisClient();

    // Store state -> userId mapping in Redis with 10-minute expiry
    await redis.set(`mailflow:slack:state:${state}`, userId, 'EX', 600);

    const params = new URLSearchParams({
      client_id: clientId,
      scope: 'incoming-webhook',
      redirect_uri: redirectUri,
      state,
    });

    const url = `https://slack.com/oauth/v2/authorize?${params.toString()}`;
    return { url, state };
  },

  /**
   * Validates OAuth state and exchanges code with Slack API for webhook details.
   */
  async handleOAuthCallback(code: string, state: string): Promise<SlackConnection> {
    if (!state || !code) {
      throw new ValidationError('Missing authorization code or state parameter.');
    }

    const redis = getRedisClient();
    const stateKey = `mailflow:slack:state:${state}`;
    const userId = await redis.get(stateKey);

    if (!userId) {
      throw new ValidationError('Invalid or expired Slack OAuth state parameter.');
    }

    // Single-use state token — delete immediately
    await redis.del(stateKey);

    const clientId = env.SLACK_CLIENT_ID || process.env.SLACK_CLIENT_ID || 'mock_slack_client_id';
    const clientSecret = env.SLACK_CLIENT_SECRET || process.env.SLACK_CLIENT_SECRET || 'mock_slack_client_secret';
    const redirectUri = env.SLACK_REDIRECT_URI || process.env.SLACK_REDIRECT_URI || 'http://localhost:5000/api/slack/callback';

    if (!clientId || !clientSecret) {
      throw new ValidationError('Slack OAuth credentials are not configured on the server.');
    }

    const bodyParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const slackRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    });

    const slackData = (await slackRes.json()) as any;

    if (!slackData.ok) {
      throw new ValidationError(
        `Slack OAuth authorization failed: ${slackData.error || 'Unknown error'}`,
      );
    }

    const teamId = slackData.team?.id;
    const teamName = slackData.team?.name || 'Slack Team';
    const webhookUrl = slackData.incoming_webhook?.url;

    if (!teamId || !webhookUrl) {
      throw new ValidationError('Slack response is missing team information or webhook URL.');
    }

    // Reuse existing connection if user already has one, else create new
    const existingConnections = await slackConnectionRepository.findByUserId(userId);

    if (existingConnections.length > 0) {
      const target = (existingConnections.find((c) => c.teamId === teamId) ||
        existingConnections[0])!;

      return slackConnectionRepository.update(target.id, userId, {
        teamName,
        webhookUrl,
      });
    }

    return slackConnectionRepository.create({
      userId,
      teamId,
      teamName,
      webhookUrl,
    });
  },

  /**
   * Returns safe Slack connection status for authenticated user.
   * NEVER exposes webhookUrl, OAuth tokens, or secrets.
   */
  async getStatus(userId: string): Promise<SlackStatusResponse> {
    const connections = await slackConnectionRepository.findByUserId(userId);
    if (connections.length > 0 && connections[0]) {
      return {
        connected: true,
        teamName: connections[0].teamName || 'Slack Team',
      };
    }

    return {
      connected: false,
    };
  },

  /**
   * Removes Slack connection for the user safely.
   */
  async disconnect(userId: string, connectionId?: string): Promise<boolean> {
    const connections = await slackConnectionRepository.findByUserId(userId);
    if (connections.length === 0) {
      return true; // Handled safely when no connection exists
    }

    if (connectionId) {
      const target = connections.find((c) => c.id === connectionId);
      if (target) {
        await slackConnectionRepository.delete(target.id, userId);
      }
    } else {
      for (const conn of connections) {
        await slackConnectionRepository.delete(conn.id, userId);
      }
    }

    return true;
  },

  /**
   * Sends real rate-limit notification to user's Slack webhook with Redis deduplication.
   * Auxiliary notification channel — failure MUST NEVER break email processing.
   */
  async notifyRateLimitExceeded(
    userId: string,
    details: {
      rateLimitValue: number;
      nextAvailableTimeMs: number;
    },
  ): Promise<boolean> {
    try {
      const windowStr = rateLimitService.getHourlyWindowString();
      const dedupKey = `mailflow:slack:dedup:${userId}:${windowStr}`;
      const redis = getRedisClient();

      // Distributed deduplication: 1 notification per rate-limit window per user
      const acquired = await redis.set(dedupKey, '1', 'EX', 3600, 'NX');
      if (!acquired) {
        console.log(
          `[slack] ℹ️ Rate limit notification already sent for user ${userId} in window ${windowStr}. Skipping duplicate.`,
        );
        return false;
      }

      const connections = await slackConnectionRepository.findByUserId(userId);
      if (connections.length === 0 || !connections[0]) {
        console.log(`[slack] ℹ️ User ${userId} has no Slack connection configured. Skipping notification.`);
        return false;
      }

      const connection = connections[0];
      const nextAvailableStr = new Date(details.nextAvailableTimeMs).toISOString();

      const payload = {
        text: 'MailFlow email rate limit reached. Scheduled email delivery has been delayed until capacity is available.',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '⚠️ *MailFlow email rate limit reached.*\nScheduled email delivery has been delayed until capacity is available.',
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Hourly Limit:*\n${details.rateLimitValue} emails/hr`,
              },
              {
                type: 'mrkdwn',
                text: `*Next Available Window:*\n${nextAvailableStr}`,
              },
            ],
          },
        ],
      };

      const response = await fetch(connection.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(
          `[slack] ⚠️ Failed to deliver Slack rate limit notification. Status: ${response.status}`,
        );
        return false;
      }

      console.log(`[slack] 🔔 Sent rate-limit notification to user ${userId} via Slack webhook.`);
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[slack] ⚠️ Error sending Slack rate limit notification: ${errorMsg}`);
      return false; // Return false cleanly so caller / worker never fails
    }
  },

  async createOrUpdateConnection(
    userId: string,
    data: Omit<CreateSlackConnectionData, 'userId'>,
  ): Promise<SlackConnection> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError(`User with ID '${userId}' not found.`);
    }

    if (!data.teamId || data.teamId.trim() === '') {
      throw new ValidationError('Slack teamId is required.');
    }

    if (!webhookUrlSchema.safeParse(data.webhookUrl).success) {
      throw new ValidationError('Invalid Slack webhook URL format.');
    }

    const existing = await slackConnectionRepository.findByUserAndTeam(userId, data.teamId);

    if (existing) {
      return slackConnectionRepository.update(existing.id, userId, {
        teamName: data.teamName,
        webhookUrl: data.webhookUrl,
      });
    }

    return slackConnectionRepository.create({
      userId,
      teamId: data.teamId,
      teamName: data.teamName,
      webhookUrl: data.webhookUrl,
    });
  },

  async getConnectionByUser(userId: string): Promise<SlackConnection[]> {
    return slackConnectionRepository.findByUserId(userId);
  },

  async getConnectionById(userId: string, connectionId: string): Promise<SlackConnection> {
    const connection = await slackConnectionRepository.findById(connectionId);
    if (!connection) {
      throw new NotFoundError(`Slack connection with ID '${connectionId}' not found.`);
    }

    if (connection.userId !== userId) {
      throw new ForbiddenError('You do not have permission to access this Slack connection.');
    }

    return connection;
  },

  async updateConnection(
    userId: string,
    connectionId: string,
    data: UpdateSlackConnectionData,
  ): Promise<SlackConnection> {
    await this.getConnectionById(userId, connectionId);

    if (data.webhookUrl && !webhookUrlSchema.safeParse(data.webhookUrl).success) {
      throw new ValidationError('Invalid Slack webhook URL format.');
    }

    return slackConnectionRepository.update(connectionId, userId, data);
  },

  async deleteConnection(userId: string, connectionId: string): Promise<SlackConnection> {
    await this.getConnectionById(userId, connectionId);
    return slackConnectionRepository.delete(connectionId, userId);
  },
};

