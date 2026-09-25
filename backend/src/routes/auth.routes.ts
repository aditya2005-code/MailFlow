import { Router } from 'express';
import { googleAuth, googleAuthCallback, getCurrentUser, logout } from '../controllers/authController.js';
import { requireAuth } from '../middleware/authDev.js';

const router = Router();

// Public OAuth endpoints
router.get('/google', googleAuth);
router.get('/google/callback', googleAuthCallback);

// Protected session endpoints
router.get('/me', requireAuth, getCurrentUser);
router.post('/logout', logout);

export default router;
