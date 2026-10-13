import { errorResponse } from '../utils/response.js';
import { normalizeRole } from '../constants/roles.js';

/**
 * Middleware phân quyền truy cập theo vai trò RBAC (Role-Based Access Control)
 * Yêu cầu: Bắt buộc đặt sau authenticateToken middleware!
 * 
 * Cách sử dụng linh hoạt:
 * - requireRole("ADMIN")
 * - requireRole("ADMIN", "HR_MANAGER")
 * - requireRole(["ADMIN", "HR_MANAGER"])
 * 
 * @param  {...(string|string[])} allowedRoles - Danh sách các vai trò được phép truy cập
 */
export function requireRole(...allowedRoles) {
  // Làm phẳng mảng đối số (hỗ trợ cả truyền danh sách rời rạc hoặc mảng)
  const flattenedRoles = allowedRoles.flat();

  // Chuẩn hóa danh sách vai trò cho phép sang mã RBAC chuẩn ('ADMIN', 'HR_MANAGER', 'EMPLOYEE')
  const validAllowedRoles = flattenedRoles
    .map((r) => normalizeRole(r))
    .filter((r) => Boolean(r));

  return (req, res, next) => {
    // 1. Kiểm tra trạng thái xác thực
    if (!req.user) {
      return errorResponse(res, {
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
        message: 'Vui lòng đăng nhập để tiếp tục.',
      });
    }

    // 2. Lấy vai trò của người dùng hiện tại (đã được chuẩn hóa trong auth middleware)
    const userRole = normalizeRole(req.user.role);

    // 3. Nếu vai trò của người dùng không hợp lệ -> Từ chối truy cập ngay lập tức
    if (!userRole) {
      return errorResponse(res, {
        statusCode: 403,
        errorCode: 'INVALID_USER_ROLE',
        message: 'Vai trò người dùng không hợp lệ trong hệ thống.',
      });
    }

    // 4. Kiểm tra quyền truy cập theo danh sách được chỉ định
    if (!validAllowedRoles.includes(userRole)) {
      return errorResponse(res, {
        statusCode: 403,
        errorCode: 'FORBIDDEN',
        message: 'Bạn không có quyền thực hiện thao tác này.',
      });
    }

    // 5. Thỏa mãn quyền -> Chuyển tiếp request đến controller tiếp theo
    next();
  };
}

// Alias hỗ trợ số nhiều cho sự tiện lợi
export const requireRoles = requireRole;

export default {
  requireRole,
  requireRoles,
};
