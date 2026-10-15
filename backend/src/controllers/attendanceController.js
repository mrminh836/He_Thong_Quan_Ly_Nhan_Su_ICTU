import attendanceService, { AttendanceServiceError } from '../services/attendanceService.js';
import { successResponse, errorResponse } from '../utils/response.js';

/**
 * Controller xử lý các yêu cầu Chấm công (Attendance Controller)
 */

/**
 * Xử lý yêu cầu Check-in của nhân viên đã xác thực
 * POST /api/attendances/check-in
 * 
 * Bảo mật:
 * - Nhân viên được xác định hoàn toàn qua JWT token (req.user), không nhận employeeId từ body.
 * - Thời gian chấm công được lấy tự động từ đồng hồ hệ thống server (múi giờ Việt Nam).
 * - Không cho phép client giả mạo checkInTime hoặc status.
 */
export async function checkIn(req, res, next) {
  try {
    // 1. Kiểm tra định danh tài khoản từ middleware xác thực
    if (!req.user || !req.user.userId) {
      return errorResponse(res, {
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
        message: 'Vui lòng đăng nhập để thực hiện chấm công.',
      });
    }

    // 2. Gọi service thực hiện check-in với đồng hồ server
    const result = await attendanceService.performCheckIn({
      userId: req.user.userId,
      userEmployeeId: req.user.employeeId,
      // Lưu ý: Tuyệt đối không truyền req.body.checkInTime, req.body.employeeId hay req.body.status
    });

    // 3. Trả về phản hồi thành công (HTTP 201 Created)
    return successResponse(res, {
      statusCode: 201,
      message: result.message,
      data: {
        attendanceId: result.attendanceId,
        employeeId: result.employeeId,
        workDate: result.workDate,
        checkInTime: result.checkInTime,
        status: result.status,
      },
    });
  } catch (error) {
    // Bắt các lỗi nghiệp vụ đã được định nghĩa
    if (error instanceof AttendanceServiceError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
        details: error.details,
      });
    }

    // Chuyển tiếp các lỗi không mong muốn cho error handler tập trung
    next(error);
  }
}

export default {
  checkIn,
};
