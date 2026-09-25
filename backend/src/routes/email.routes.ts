import { Router } from 'express';
import {
  getEmails,
  getEmailById,
  createEmail,
  bulkCreateEmails,
} from '../controllers/emailController.js';
import { requireAuth } from '../middleware/authDev.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema, paginationQuerySchema } from '../validators/commonValidator.js';
import { createEmailSchema, bulkCreateEmailSchema } from '../validators/emailValidator.js';

const router = Router();

router.use(requireAuth);

router.get('/', validateRequest({ query: paginationQuerySchema }), getEmails);
router.get('/:id', validateRequest({ params: idParamSchema }), getEmailById);
router.post('/', validateRequest({ body: createEmailSchema }), createEmail);
router.post('/bulk', validateRequest({ body: bulkCreateEmailSchema }), bulkCreateEmails);

export default router;
