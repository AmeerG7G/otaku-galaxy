import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/error-handler.js';

export const authRoutes = Router();

const publicLimiter = authRateLimiter();

authRoutes.post('/register', publicLimiter, authController.register);
authRoutes.post('/verify', publicLimiter, authController.verify);
authRoutes.post('/resend-code', publicLimiter, authController.resendCode);
authRoutes.post('/login', publicLimiter, authController.login);
authRoutes.post('/forgot-password', publicLimiter, authController.forgotPassword);
authRoutes.post('/reset-password', publicLimiter, authController.resetPassword);

authRoutes.get('/me', authenticate, authController.me);
authRoutes.patch('/me', authenticate, authController.updateProfile);