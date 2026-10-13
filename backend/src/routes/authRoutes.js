import { Router } from 'express';
import authController from '../controllers/authController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { loginRateLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

/**
 * @route   POST /api/auth/login
 * @desc    Xác thực đăng nhập người dùng và cấp phát JWT Access Token
 * @access  Public (được bảo vệ bằng Rate Limiting)
 */
router.post('/login', loginRateLimiter(), authController.login);

/**
 * @route   GET /api/auth/profile
 * @desc    Lấy thông tin hồ sơ của người dùng hiện tại
 * @access  Private (Yêu cầu JWT Bearer Token)
 */
router.get('/profile', authenticateToken, authController.getProfile);

export default router;
