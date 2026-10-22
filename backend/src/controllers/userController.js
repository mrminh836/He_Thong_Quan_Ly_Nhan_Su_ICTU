import userService, { UserError } from '../services/userService.js';
import { successResponse, errorResponse } from '../utils/response.js';

/**
 * Controller cập nhật trạng thái tài khoản người dùng (Active / Locked)
 * Endpoint: PATCH /api/users/:id/status
 */
export async function updateStatus(req, res, next) {
  try {
    const rawId = req.params.id;
    const userId = Number(rawId);

    // 1. Kiểm tra tính hợp lệ của tham số ID
    if (!rawId || isNaN(userId) || !Number.isInteger(userId) || userId <= 0) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'INVALID_ID',
        message: 'ID tài khoản không hợp lệ. Vui lòng cung cấp số nguyên dương.',
      });
    }

    // 2. Kiểm tra định dạng Request Body
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'VALIDATION_ERROR',
        message: 'Dữ liệu yêu cầu phải là một đối tượng JSON hợp lệ.',
      });
    }

    const { status } = req.body;

    // 3. Kiểm tra trường status bắt buộc
    if (status === undefined || status === null || (typeof status === 'string' && !status.trim())) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'VALIDATION_ERROR',
        message: 'Trạng thái tài khoản (status) là bắt buộc.',
      });
    }

    // 4. Kiểm tra kiểu dữ liệu và giá trị cho phép của status
    if (typeof status !== 'string') {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'INVALID_STATUS',
        message: 'Trạng thái tài khoản phải là chuỗi ký tự (Active hoặc Locked).',
      });
    }

    const cleanStatus = status.trim();
    if (!['Active', 'Locked'].includes(cleanStatus)) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'INVALID_STATUS',
        message: 'Trạng thái tài khoản không hợp lệ. Chỉ chấp nhận Active hoặc Locked.',
      });
    }

    // 5. Gọi Service xử lý nghiệp vụ và cập nhật CSDL
    const updatedUser = await userService.updateUserStatus({
      targetUserId: userId,
      newStatus: cleanStatus,
      currentUserId: req.user?.id || req.user?.sub,
      currentUserRole: req.user?.role,
    });

    // 6. Trả phản hồi thành công HTTP 200
    return successResponse(res, {
      statusCode: 200,
      message: 'Cập nhật trạng thái tài khoản thành công.',
      data: updatedUser,
    });
  } catch (error) {
    if (error instanceof UserError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
      });
    }

    // Chuyển tiếp lỗi hệ thống cho Error Handler tập trung
    next(error);
  }
}

export default {
  updateStatus,
};
