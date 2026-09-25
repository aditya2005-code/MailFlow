import { Router } from 'express';
import {
  getSenders,
  getSenderById,
  createSender,
  updateSender,
  deleteSender,
} from '../controllers/senderController.js';
import { requireAuth } from '../middleware/authDev.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/commonValidator.js';
import { createSenderSchema, updateSenderSchema } from '../validators/senderValidator.js';

const router = Router();

router.use(requireAuth);

router.get('/', getSenders);
router.get('/:id', validateRequest({ params: idParamSchema }), getSenderById);
router.post('/', validateRequest({ body: createSenderSchema }), createSender);
router.put(
  '/:id',
  validateRequest({ params: idParamSchema, body: updateSenderSchema }),
  updateSender,
);
router.delete('/:id', validateRequest({ params: idParamSchema }), deleteSender);

export default router;
