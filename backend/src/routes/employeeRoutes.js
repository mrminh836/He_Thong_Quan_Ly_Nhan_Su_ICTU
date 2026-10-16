import { Router } from 'express';
import {
  createEmployee,
  getEmployeeById,
  getEmployees,
  updateEmployee,
  resignEmployee,
} from '../controllers/employeeController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/role.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

/**
 * Tất cả các API Quản lý nhân sự bắt buộc phải có JWT Token hợp lệ
 */
router.use(authenticateToken);

/**
 * 1. GET /api/employees - Lấy danh sách nhân viên có phân trang và lọc theo phòng ban
 * Hỗ trợ các query: page, limit, departmentId, search
 * Quyền hạn: Chỉ ADMIN và HR_MANAGER được phép truy cập
 */
router.get(
  '/',
  requireRole(ROLES.ADMIN, ROLES.HR_MANAGER),
  getEmployees
);

/**
 * 2. POST /api/employees - Thêm mới nhân sự vào hệ thống
 * Mã hóa số CCCD bằng hàm MySQL AES_ENCRYPT và bảo vệ tính duy nhất bằng HMAC-SHA-256
 * Quyền hạn: Chỉ ADMIN và HR_MANAGER được phép thực hiện
 */
router.post(
  '/',
  requireRole(ROLES.ADMIN, ROLES.HR_MANAGER),
  createEmployee
);

/**
 * 3. GET /api/employees/:id - Xem thông tin chi tiết một nhân sự và giải mã CCCD
 * Giải mã số CCCD bằng hàm MySQL AES_DECRYPT()
 * Quyền hạn: Chỉ ADMIN và HR_MANAGER được phép truy cập
 */
router.get(
  '/:id',
  requireRole(ROLES.ADMIN, ROLES.HR_MANAGER),
  getEmployeeById
);

/**
 * 4. PUT /api/employees/:id - Cập nhật chức vụ, mức lương và số điện thoại của nhân sự
 * Quyền hạn: Chỉ ADMIN và HR_MANAGER được phép thực hiện
 */
router.put(
  '/:id',
  requireRole(ROLES.ADMIN, ROLES.HR_MANAGER),
  updateEmployee
);

/**
 * 5. PATCH /api/employees/:id - Cho nhân viên thôi việc (Resigned) và khóa tài khoản User liên kết
 * Request body: { action: 'RESIGN' }
 * Quyền hạn: Chỉ ADMIN và HR_MANAGER được phép thực hiện
 */
router.patch(
  '/:id',
  requireRole(ROLES.ADMIN, ROLES.HR_MANAGER),
  resignEmployee
);

export default router;
