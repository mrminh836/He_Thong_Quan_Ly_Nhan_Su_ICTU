import { Router } from 'express';
import { createEmployee, getEmployeeById } from '../controllers/employeeController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/role.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

/**
 * Tất cả các API Quản lý nhân sự bắt buộc phải có JWT Token hợp lệ
 */
router.use(authenticateToken);

/**
 * 1. POST /api/employees - Thêm mới nhân sự vào hệ thống
 * Mã hóa số CCCD bằng hàm MySQL AES_ENCRYPT và bảo vệ tính duy nhất bằng HMAC-SHA-256
 * Quyền hạn: Chỉ ADMIN và HR_MANAGER được phép thực hiện
 */
router.post(
  '/',
  requireRole(ROLES.ADMIN, ROLES.HR_MANAGER),
  createEmployee
);

/**
 * 2. GET /api/employees/:id - Xem thông tin chi tiết một nhân sự và giải mã CCCD
 * Giải mã số CCCD bằng hàm MySQL AES_DECRYPT()
 * Quyền hạn: Chỉ ADMIN và HR_MANAGER được phép truy cập
 */
router.get(
  '/:id',
  requireRole(ROLES.ADMIN, ROLES.HR_MANAGER),
  getEmployeeById
);

export default router;
