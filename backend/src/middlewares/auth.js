import { verifyAccessToken } from '../utils/jwt.js';
import { errorResponse } from '../utils/response.js';

/**
 * Middleware xác thực JSON Web Token (JWT Authentication)
 * Trích xuất token từ header Authorization: Bearer <token>
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader) {
    return errorResponse(res, {
      statusCode: 401,
      errorCode: 'TOKEN_REQUIRED',
      message: 'Yêu cầu token xác thực. Vui lòng đăng nhập để tiếp tục.',
    });
  }

  // Định dạng chuẩn: Bearer <token>
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return errorResponse(res, {
      statusCode: 401,
      errorCode: 'INVALID_TOKEN_FORMAT',
      message: 'Định dạng token không hợp lệ. Chuẩn yêu cầu: Bearer <token>',
    });
  }

  const token = parts[1];

  try {
    const decoded = verifyAccessToken(token);
    // Gắn thông tin người dùng đã giải mã vào req.user
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return errorResponse(res, {
        statusCode: 401,
        errorCode: 'TOKEN_EXPIRED',
        message: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
      });
    }

    return errorResponse(res, {
      statusCode: 401,
      errorCode: 'INVALID_TOKEN',
      message: 'Token xác thực không hợp lệ hoặc đã bị thay đổi.',
    });
  }
}

/**
 * Middleware phân quyền người dùng theo vai trò RBAC (Role-Based Access Control)
 * 
 * @param  {...string} allowedRoles - Danh sách các vai trò được phép (vd: 'Admin', 'HR')
 */
export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, {
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
        message: 'Yêu cầu xác thực tài khoản.',
      });
    }

    const userRole = req.user.role;
    if (!allowedRoles.includes(userRole)) {
      return errorResponse(res, {
        statusCode: 403,
        errorCode: 'FORBIDDEN',
        message: 'Bạn không có quyền thực hiện chức năng này.',
      });
    }

    next();
  };
}

export default {
  authenticateToken,
  requireRoles,
};
