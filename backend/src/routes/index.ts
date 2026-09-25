import { Router } from 'express';
import healthRouter from './health.js';
import userRouter from './user.routes.js';
import senderRouter from './sender.routes.js';
import campaignRouter from './campaign.routes.js';
import emailRouter from './email.routes.js';
import slackRouter from './slack.routes.js';

const router = Router();

// ─── Health Routes ───────────────────────────────────────────────────────────
router.use('/health', healthRouter);

// ─── Core Application REST API Routes ────────────────────────────────────────
router.use('/users', userRouter);
router.use('/senders', senderRouter);
router.use('/campaigns', campaignRouter);
router.use('/emails', emailRouter);
router.use('/slack', slackRouter);

export default router;
