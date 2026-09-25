import { Router } from 'express';
import {
  getSlackAuthUrl,
  handleSlackCallback,
  getSlackStatus,
  disconnectSlack,
  getSlackConnections,
  createOrUpdateSlackConnection,
  deleteSlackConnection,
} from '../controllers/slackController.js';
import { requireAuth } from '../middleware/authDev.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/commonValidator.js';
import { createSlackConnectionSchema } from '../validators/slackValidator.js';

const router = Router();

// OAuth Endpoints
router.get('/auth', requireAuth, getSlackAuthUrl);
router.get('/callback', handleSlackCallback);

// Connection Management Endpoints
router.get('/status', requireAuth, getSlackStatus);
router.delete('/disconnect', requireAuth, disconnectSlack);

// Direct CRUD routes for backward compatibility
router.get('/', requireAuth, getSlackConnections);
router.post('/', requireAuth, validateRequest({ body: createSlackConnectionSchema }), createOrUpdateSlackConnection);
router.delete('/:id', requireAuth, validateRequest({ params: idParamSchema }), deleteSlackConnection);

export default router;

