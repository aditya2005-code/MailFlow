import { Router } from 'express';
import { getCurrentUser, getUserById } from '../controllers/userController.js';
import { requireAuth } from '../middleware/authDev.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/commonValidator.js';

const router = Router();

router.use(requireAuth);

router.get('/me', getCurrentUser);
router.get('/:id', validateRequest({ params: idParamSchema }), getUserById);

export default router;
