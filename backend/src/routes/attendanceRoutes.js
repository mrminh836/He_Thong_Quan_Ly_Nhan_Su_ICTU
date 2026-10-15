import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.js';
import attendanceController from '../controllers/attendanceController.js';

const router = Router();

// Toàn bộ các endpoint chấm công yêu cầu người dùng phải xác thực JWT
router.use(authenticateToken);

/**
 * @route   POST /api/attendance/check-in hoặc POST /api/attendances/check-in
 * @desc    Thực hiện check-in vào ca cho nhân viên đang đăng nhập
 * @access  Đã đăng nhập (Admin, HR, Employee có liên kết hồ sơ nhân sự)
 */
router.post('/check-in', attendanceController.checkIn);

/**
 * @route   POST /api/attendance/check-out hoặc POST /api/attendances/check-out
 * @desc    Ghi nhận giờ kết thúc ngày làm việc (Check-out)
 * @access  Đã đăng nhập (Yêu cầu đã check-in trong ngày)
 */
router.post('/check-out', attendanceController.checkOut);

/**
 * @route   GET /api/attendance/today hoặc GET /api/attendances/today
 * @desc    Lấy dữ liệu chấm công hôm nay theo quyền RBAC (Cá nhân hoặc Toàn công ty)
 * @access  Đã đăng nhập
 */
router.get('/today', attendanceController.getToday);

export default router;
