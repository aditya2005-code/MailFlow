import { Request, Response } from 'express';
import { slackConnectionService } from '../services/slackConnectionService.js';
import { ApiResponse } from '../types/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';

/**
   * Initiates Slack OAuth flow by generating state and returning authorization URL.
   */
export const getSlackAuthUrl = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { url, state } = await slackConnectionService.getSlackAuthUrl(req.userId!);

  const acceptsJson =
    req.headers.accept?.includes('application/json') || req.query.json === 'true';

  if (acceptsJson) {
    const body: ApiResponse = {
      success: true,
      data: { url, state },
    };
    res.status(200).json(body);
    return;
  }

  res.redirect(url);
});

/**
 * Handles Slack OAuth authorization callback.
 */
export const handleSlackCallback = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const oauthError = req.query.error as string;

    const acceptsJson =
      req.headers.accept?.includes('application/json') || req.query.json === 'true';

    if (oauthError) {
      if (acceptsJson) {
        res.status(400).json({ success: false, error: `Slack OAuth error: ${oauthError}` });
        return;
      }
      res.redirect(`${env.FRONTEND_URL}/settings/slack?error=${encodeURIComponent(oauthError)}`);
      return;
    }

    try {
      const connection = await slackConnectionService.handleOAuthCallback(code, state);

      if (acceptsJson) {
        const body: ApiResponse = {
          success: true,
          data: {
            id: connection.id,
            teamId: connection.teamId,
            teamName: connection.teamName,
          },
          message: 'Slack connection successfully linked.',
        };
        res.status(200).json(body);
        return;
      }

      res.redirect(`${env.FRONTEND_URL}?slack=connected`);
    } catch (err: any) {
      if (acceptsJson) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      res.redirect(
        `${env.FRONTEND_URL}/settings/slack?error=${encodeURIComponent(err.message)}`,
      );
    }
  },
);

/**
 * Returns safe Slack connection status for authenticated user.
 * Webhook URL and secret tokens are NEVER returned.
 */
export const getSlackStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const status = await slackConnectionService.getStatus(req.userId!);
  const body: ApiResponse = {
    success: true,
    data: status,
  };
  res.status(200).json(body);
});

/**
 * Disconnects/removes Slack connection for authenticated user safely.
 */
export const disconnectSlack = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const connectionId = req.params.id as string | undefined;
  await slackConnectionService.disconnect(req.userId!, connectionId);
  const body: ApiResponse = {
    success: true,
    message: 'Slack connection removed successfully',
  };
  res.status(200).json(body);
});

export const getSlackConnections = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const connections = await slackConnectionService.getConnectionByUser(req.userId!);
  const body: ApiResponse = {
    success: true,
    data: connections.map((c) => ({
      id: c.id,
      teamId: c.teamId,
      teamName: c.teamName,
      createdAt: c.createdAt,
    })),
  };
  res.status(200).json(body);
});

export const createOrUpdateSlackConnection = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const connection = await slackConnectionService.createOrUpdateConnection(req.userId!, req.body);
    const body: ApiResponse = {
      success: true,
      data: {
        id: connection.id,
        teamId: connection.teamId,
        teamName: connection.teamName,
      },
    };
    res.status(200).json(body);
  },
);

export const deleteSlackConnection = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    await slackConnectionService.deleteConnection(req.userId!, id);
    const body: ApiResponse = {
      success: true,
      message: 'Slack connection removed successfully',
    };
    res.status(200).json(body);
  },
);

