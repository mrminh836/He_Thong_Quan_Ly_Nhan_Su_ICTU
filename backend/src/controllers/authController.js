import authService, { AuthError } from '../services/authService.js';
import { successResponse, errorResponse } from '../utils/response.js';

/**
 * Controller xử lý yêu cầu đăng nhập hệ thống
 * Endpoint: POST /api/auth/login
 */
export async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};

    // 1. Kiểm tra sự tồn tại của tham số
    if (!username || !password) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'VALIDATION_ERROR',
        message: 'Tên đăng nhập và mật khẩu là bắt buộc.',
      });
    }

    // 2. Kiểm tra kiểu dữ liệu
    if (typeof username !== 'string' || typeof password !== 'string') {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'INVALID_DATA_TYPE',
        message: 'Tên đăng nhập và mật khẩu phải là chuỗi ký tự hợp lệ.',
      });
    }

    // 3. Thực hiện xác thực thông qua Service
    const authResult = await authService.login({
      username: username.trim(),
      password,
    });

    // 4. Trả kết quả thành công chuẩn HTTP 200
    return successResponse(res, {
      statusCode: 200,
      message: 'Đăng nhập thành công',
      data: authResult,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
      });
    }

    // Chuyển tiếp lỗi hệ thống không mong muốn cho error handler tập trung
    next(error);
  }
}

/**
 * Controller lấy thông tin hồ sơ của tài khoản đang đăng nhập
 * Endpoint: GET /api/auth/profile
 */
export async function getProfile(req, res, next) {
  try {
    const userId = req.user?.sub;
    const profile = await authService.getProfile(userId);

    return successResponse(res, {
      statusCode: 200,
      message: 'Lấy thông tin tài khoản thành công',
      data: profile,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
      });
    }

    next(error);
  }
}

export default {
  login,
  getProfile,
};
