import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/role.js';
import { ROLES } from '../constants/roles.js';
import dashboardController from '../controllers/dashboardController.js';

const router = Router();

/**
 * GET /api/dashboard/stats
 * Lấy các chỉ số KPI thống kê tổng quan hệ thống HRM
 * Phân quyền: Chỉ ADMIN và HR_MANAGER được phép truy cập
 */
router.get(
  '/stats',
  authenticateToken,
  requireRole(ROLES.ADMIN, ROLES.HR_MANAGER),
  dashboardController.getStats
);

/**
 * GET /api/dashboard/department-ontime
 * Thống kê tỷ lệ chấm công đúng giờ theo phòng ban ('today' | '7days' | 'month')
 * Phân quyền: ADMIN và HR_MANAGER
 */
router.get(
  '/department-ontime',
  authenticateToken,
  requireRole(ROLES.ADMIN, ROLES.HR_MANAGER),
  dashboardController.getDepartmentOnTimeRates
);

export default router;
