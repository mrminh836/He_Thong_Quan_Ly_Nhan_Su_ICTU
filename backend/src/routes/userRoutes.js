import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/role.js';
import { ROLES } from '../constants/roles.js';
import { updateStatus } from '../controllers/userController.js';

const router = Router();

/**
 * @route   PATCH /api/users/:id/status
 * @desc    Cập nhật trạng thái tài khoản người dùng (Active / Locked)
 *          Thu hồi hiệu lực tất cả JWT của tài khoản đó ngay lập tức khi Locked
 * @access  Chỉ dành cho Quản trị viên (ADMIN)
 */
router.patch(
  '/:id/status',
  authenticateToken,
  requireRole(ROLES.ADMIN),
  updateStatus
);

export default router;
