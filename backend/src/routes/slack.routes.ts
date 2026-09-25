import { Router } from 'express';
import {
  getSlackConnections,
  createOrUpdateSlackConnection,
  deleteSlackConnection,
} from '../controllers/slackController.js';
import { requireAuth } from '../middleware/authDev.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/commonValidator.js';
import { createSlackConnectionSchema } from '../validators/slackValidator.js';

const router = Router();

router.use(requireAuth);

router.get('/', getSlackConnections);
router.post('/', validateRequest({ body: createSlackConnectionSchema }), createOrUpdateSlackConnection);
router.delete('/:id', validateRequest({ params: idParamSchema }), deleteSlackConnection);

export default router;
