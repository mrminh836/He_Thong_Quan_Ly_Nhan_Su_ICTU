import { verifyAccessToken } from '../utils/jwt.js';
import { errorResponse } from '../utils/response.js';
import userRepository from '../repositories/userRepository.js';
import { normalizeRole } from '../constants/roles.js';

/**
 * Middleware xác thực JSON Web Token & Trạng thái tài khoản thời gian thực (Real-time Auth Guard)
 * Đảm bảo:
 * 1. Token hợp lệ, đúng chữ ký HS256 và chưa hết hạn.
 * 2. Tài khoản thực sự tồn tại trong Cơ sở Dữ liệu.
 * 3. Tài khoản đang ở trạng thái 'Active' (ngăn chặn truy cập nếu tài khoản vừa bị khóa).
 * 4. Vai trò (Role) được cập nhật đồng bộ trực tiếp từ Database.
 */
export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  // 1. Kiểm tra sự tồn tại của header Authorization
  if (!authHeader) {
    return errorResponse(res, {
      statusCode: 401,
      errorCode: 'TOKEN_REQUIRED',
      message: 'Vui lòng đăng nhập để tiếp tục.',
    });
  }

  // 2. Kiểm tra định dạng chuẩn: Bearer <token>
  const parts = String(authHeader).trim().split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return errorResponse(res, {
      statusCode: 401,
      errorCode: 'INVALID_TOKEN_FORMAT',
      message: 'Định dạng token không hợp lệ. Chuẩn yêu cầu: Bearer <token>',
    });
  }

  const token = parts[1];

  let decoded;
  try {
    // 3. Xác minh chữ ký và thời hạn token
    decoded = verifyAccessToken(token);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return errorResponse(res, {
        statusCode: 401,
        errorCode: 'TOKEN_EXPIRED',
        message: 'Token không hợp lệ hoặc đã hết hạn.',
      });
    }

    return errorResponse(res, {
      statusCode: 401,
      errorCode: 'INVALID_TOKEN',
      message: 'Token không hợp lệ hoặc đã hết hạn.',
    });
  }

  // 4. Kiểm tra các claim định danh bắt buộc
  const userId = decoded.sub || decoded.userId || decoded.id;
  if (!userId) {
    return errorResponse(res, {
      statusCode: 401,
      errorCode: 'INVALID_TOKEN_CLAIMS',
      message: 'Token thiếu thông tin định danh người dùng bắt buộc.',
    });
  }

  try {
    // 5. Xác minh sự tồn tại và trạng thái tài khoản theo thời gian thực từ Database
    const user = await userRepository.findById(userId);

    if (!user) {
      return errorResponse(res, {
        statusCode: 401,
        errorCode: 'USER_NOT_FOUND',
        message: 'Tài khoản không tồn tại trên hệ thống hoặc đã bị xóa.',
      });
    }

    // 6. Kiểm tra trạng thái tài khoản
    if (user.account_status !== 'Active') {
      const statusText = user.account_status === 'Locked' ? 'đã bị khóa' : 'đã ngừng hoạt động';
      return errorResponse(res, {
        statusCode: 403,
        errorCode: 'ACCOUNT_LOCKED',
        message: `Tài khoản của bạn ${statusText}. Vui lòng liên hệ Quản trị viên để được hỗ trợ.`,
      });
    }

    // 7. Chuẩn hóa vai trò người dùng (RBAC Role Normalization)
    const normalizedRole = normalizeRole(user.role);
    if (!normalizedRole) {
      return errorResponse(res, {
        statusCode: 403,
        errorCode: 'INVALID_USER_ROLE',
        message: 'Vai trò tài khoản không hợp lệ hoặc chưa được gán quyền.',
      });
    }

    // 8. Gắn thông tin người dùng an toàn vào đối tượng Request
    req.user = {
      id: user.user_id,
      userId: user.user_id,
      username: user.username,
      role: normalizedRole,   // Luôn là 'ADMIN' | 'HR_MANAGER' | 'EMPLOYEE'
      rawRole: user.role,     // 'Admin' | 'HR' | 'Employee'
      employeeId: user.employee_id || null,
      status: user.account_status,
      fullName: user.full_name || null,
      email: user.email || null,
      position: user.position || null,
      departmentId: user.department_id || null,
    };

    next();
  } catch (error) {
    // Lỗi truy vấn database -> Chuyển tiếp cho error handler tập trung để trả HTTP 500 an toàn
    next(error);
  }
}

export default {
  authenticateToken,
};
