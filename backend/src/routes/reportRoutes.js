import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.js';
import reportController from '../controllers/reportController.js';

const router = Router();

// Toàn bộ các endpoint báo cáo yêu cầu người dùng phải xác thực JWT
router.use(authenticateToken);

/**
 * @route   GET /api/reports/attendance/export
 * @desc    Xuất bảng tổng hợp chấm công ra file Excel (.xlsx) hoặc CSV (.csv)
 * @access  Đã đăng nhập (RBAC: Employee chỉ xuất cá nhân; Admin/HR xuất toàn công ty hoặc lọc)
 */
router.get('/attendance/export', reportController.exportAttendance);

export default router;
