import { errorResponse } from '../utils/response.js';
import { ROLES, normalizeRole } from '../constants/roles.js';

/**
 * Middleware kiểm tra quyền sở hữu tài nguyên (Data Ownership Guard)
 * Ngăn chặn người dùng ID_A truy cập hoặc sửa đổi dữ liệu của ID_B bằng cách thay đổi URL
 * 
 * Quy tắc:
 * - ADMIN và HR_MANAGER: Được phép xem/quản lý tài nguyên theo phạm vi nghiệp vụ (Bypass ownership).
 * - EMPLOYEE: Chỉ được phép truy cập khi ID tài nguyên trên request khớp với ID cá nhân của chính họ.
 * 
 * @param {object} options
 * @param {string} [options.paramName='id'] - Tên tham số trong req.params hoặc req.query
 * @param {string} [options.resourceType='employee'] - Loại tài nguyên ('employee' | 'user')
 * @param {string[]} [options.bypassRoles] - Danh sách vai trò được miễn trừ kiểm tra sở hữu
 */
export function requireOwnershipOrRole({
  paramName = 'id',
  resourceType = 'employee',
  bypassRoles = [ROLES.ADMIN, ROLES.HR_MANAGER],
} = {}) {
  const normalizedBypass = bypassRoles.map((r) => normalizeRole(r));

  return (req, res, next) => {
    // 1. Kiểm tra xác thực
    if (!req.user) {
      return errorResponse(res, {
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
        message: 'Vui lòng đăng nhập để tiếp tục.',
      });
    }

    const userRole = normalizeRole(req.user.role);

    // 2. Nếu vai trò nằm trong danh sách miễn trừ (ADMIN hoặc HR_MANAGER) -> Cho phép truy cập
    if (normalizedBypass.includes(userRole)) {
      return next();
    }

    // 3. Trích xuất ID tài nguyên mục tiêu từ URL params, query hoặc body
    const targetIdRaw = req.params[paramName] || req.query[paramName] || req.body?.[paramName];
    const targetId = Number(targetIdRaw);

    if (!targetId || isNaN(targetId)) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'INVALID_RESOURCE_ID',
        message: 'Mã định danh tài nguyên không hợp lệ.',
      });
    }

    // 4. Đối chiếu quyền sở hữu dựa trên loại tài nguyên
    let isOwner = false;

    if (resourceType === 'employee') {
      const currentEmployeeId = Number(req.user.employeeId);
      isOwner = Boolean(currentEmployeeId && currentEmployeeId === targetId);
    } else if (resourceType === 'user') {
      const currentUserId = Number(req.user.userId || req.user.id);
      isOwner = Boolean(currentUserId && currentUserId === targetId);
    }

    // 5. Nếu không phải chủ sở hữu -> Từ chối truy cập HTTP 403
    if (!isOwner) {
      return errorResponse(res, {
        statusCode: 403,
        errorCode: 'FORBIDDEN_RESOURCE',
        message: 'Bạn chỉ có quyền truy cập dữ liệu cá nhân của chính mình.',
      });
    }

    // 6. Thỏa mãn quyền sở hữu -> Tiếp tục xử lý
    next();
  };
}

export default {
  requireOwnershipOrRole,
};
