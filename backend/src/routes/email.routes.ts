import { Router } from 'express';
import {
  getEmails,
  getEmailById,
  createEmail,
  bulkCreateEmails,
  scheduleEmail,
  cancelEmail,
  rescheduleEmail,
  searchEmails,
} from '../controllers/emailController.js';
import { requireAuth } from '../middleware/authDev.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/commonValidator.js';
import {
  createEmailSchema,
  bulkCreateEmailSchema,
  listEmailsQuerySchema,
  rescheduleEmailSchema,
  searchEmailsQuerySchema,
} from '../validators/emailValidator.js';

const router = Router();

router.use(requireAuth);

router.get('/', validateRequest({ query: listEmailsQuerySchema }), getEmails);
router.get('/search', validateRequest({ query: searchEmailsQuerySchema }), searchEmails);
router.get('/:id', validateRequest({ params: idParamSchema }), getEmailById);
router.post('/', validateRequest({ body: createEmailSchema }), createEmail);
router.post('/bulk', validateRequest({ body: bulkCreateEmailSchema }), bulkCreateEmails);

// ─── Scheduler Endpoints (Phase 3.2) ───────────────────────────────────────────
router.post('/:id/schedule', validateRequest({ params: idParamSchema }), scheduleEmail);
router.post('/:id/cancel', validateRequest({ params: idParamSchema }), cancelEmail);
router.post(
  '/:id/reschedule',
  validateRequest({ params: idParamSchema, body: rescheduleEmailSchema }),
  rescheduleEmail,
);

export default router;
