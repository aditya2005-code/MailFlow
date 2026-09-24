import { Router } from 'express';
import healthRouter from './health.js';

const router = Router();

// ─── Mount sub-routers ────────────────────────────────────────────────────────
router.use('/health', healthRouter);

// Future routers will be mounted here, e.g.:
// router.use('/auth',   authRouter);
// router.use('/emails', emailsRouter);

export default router;
