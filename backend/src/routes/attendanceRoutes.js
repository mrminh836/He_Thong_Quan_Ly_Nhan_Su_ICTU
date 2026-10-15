import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.js';
import attendanceController from '../controllers/attendanceController.js';

const router = Router();

// Toàn bộ các endpoint chấm công yêu cầu người dùng phải xác thực JWT
router.use(authenticateToken);

/**
 * @route   POST /api/attendances/check-in
 * @desc    Thực hiện check-in vào ca cho nhân viên đang đăng nhập
 * @access  Tài khoản đã đăng nhập có liên kết nhân viên hợp lệ (Admin, HR, Employee)
 */
router.post('/check-in', attendanceController.checkIn);

export default router;
