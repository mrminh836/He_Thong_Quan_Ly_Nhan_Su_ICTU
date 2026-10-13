import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/role.js';
import { requireOwnershipOrRole } from '../middlewares/ownership.js';
import { successResponse } from '../utils/response.js';

const router = Router();

/**
 * @route   GET /api/rbac/admin/users
 * @desc    Truy cập danh sách quản trị tài khoản
 * @access  Chỉ dành cho ADMIN
 */
router.get(
  '/admin/users',
  authenticateToken,
  requireRole('ADMIN'),
  (req, res) => {
    return successResponse(res, {
      message: 'Truy cập tài nguyên Quản trị viên thành công',
      data: {
        role: req.user.role,
        scope: 'SYSTEM_ADMIN_ACCESS',
        permittedActions: ['CREATE_USER', 'LOCK_USER', 'CHANGE_ROLE'],
      },
    });
  }
);

/**
 * @route   GET /api/rbac/hr/employees
 * @desc    Truy cập dữ liệu nhân sự & phòng ban
 * @access  Dành cho ADMIN và HR_MANAGER
 */
router.get(
  '/hr/employees',
  authenticateToken,
  requireRole('ADMIN', 'HR_MANAGER'),
  (req, res) => {
    return successResponse(res, {
      message: 'Truy cập dữ liệu quản lý nhân sự thành công',
      data: {
        role: req.user.role,
        scope: 'HR_MANAGEMENT_ACCESS',
        permittedActions: ['VIEW_ALL_EMPLOYEES', 'UPDATE_EMPLOYEE_PROFILE', 'VIEW_DEPARTMENTS'],
      },
    });
  }
);

/**
 * @route   GET /api/rbac/employees/:id/attendances
 * @desc    Truy cập lịch sử chấm công của một nhân viên
 * @access  ADMIN, HR_MANAGER (xem toàn bộ) HOẶC EMPLOYEE (chỉ xem của chính mình)
 */
router.get(
  '/employees/:id/attendances',
  authenticateToken,
  requireOwnershipOrRole({ paramName: 'id', resourceType: 'employee' }),
  (req, res) => {
    const targetEmployeeId = Number(req.params.id);
    return successResponse(res, {
      message: 'Truy cập dữ liệu chấm công thành công',
      data: {
        requestedEmployeeId: targetEmployeeId,
        requestorRole: req.user.role,
        isOwner: req.user.employeeId === targetEmployeeId,
        attendances: [
          { date: '2026-10-13', checkIn: '08:15:00', checkOut: '17:30:00', status: 'OnTime' },
        ],
      },
    });
  }
);

export default router;
