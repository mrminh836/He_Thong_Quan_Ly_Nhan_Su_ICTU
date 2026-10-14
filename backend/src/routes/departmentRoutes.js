import { Router } from 'express';
import {
  getDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from '../controllers/departmentController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/role.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

/**
 * Tất cả các API Quản lý phòng ban đều yêu cầu xác thực JWT hợp lệ
 */
router.use(authenticateToken);

/**
 * 1. GET /api/departments - Lấy danh sách phòng ban
 * Quyền: ADMIN, HR_MANAGER, EMPLOYEE
 */
router.get(
  '/',
  requireRole(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.EMPLOYEE),
  getDepartments
);

/**
 * 2. GET /api/departments/:id - Lấy chi tiết phòng ban theo ID
 * Quyền: ADMIN, HR_MANAGER, EMPLOYEE
 */
router.get(
  '/:id',
  requireRole(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.EMPLOYEE),
  getDepartmentById
);

/**
 * 3. POST /api/departments - Tạo mới phòng ban
 * Quyền: ADMIN, HR_MANAGER
 */
router.post(
  '/',
  requireRole(ROLES.ADMIN, ROLES.HR_MANAGER),
  createDepartment
);

/**
 * 4. PUT /api/departments/:id - Cập nhật phòng ban
 * Quyền: ADMIN, HR_MANAGER
 */
router.put(
  '/:id',
  requireRole(ROLES.ADMIN, ROLES.HR_MANAGER),
  updateDepartment
);

/**
 * 5. DELETE /api/departments/:id - Xóa phòng ban
 * Quyền: ADMIN (Chỉ Quản trị viên tối cao mới được quyền xóa phòng ban)
 */
router.delete(
  '/:id',
  requireRole(ROLES.ADMIN),
  deleteDepartment
);

export default router;
