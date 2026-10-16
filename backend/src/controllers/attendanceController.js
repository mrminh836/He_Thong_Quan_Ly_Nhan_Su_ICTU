import attendanceService, { AttendanceServiceError } from '../services/attendanceService.js';
import { successResponse, errorResponse } from '../utils/response.js';

/**
 * Controller xử lý các yêu cầu Chấm công (Attendance Controller)
 */

/**
 * Xử lý yêu cầu Check-in của nhân viên đã xác thực
 * POST /api/attendances/check-in hoặc POST /api/attendance/check-in
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

    // 2. Gọi service thực hiện check-in với đồng hồ server (phớt lờ mọi trường trong req.body)
    const result = await attendanceService.performCheckIn({
      userId: req.user.userId,
      userEmployeeId: req.user.employeeId,
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
    if (error instanceof AttendanceServiceError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
        details: error.details,
      });
    }
    next(error);
  }
}

/**
 * Xử lý yêu cầu Check-out của nhân viên
 * POST /api/attendance/check-out hoặc POST /api/attendances/check-out
 */
export async function checkOut(req, res, next) {
  try {
    // 1. Kiểm tra định danh tài khoản từ token
    if (!req.user || !req.user.userId) {
      return errorResponse(res, {
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
        message: 'Vui lòng đăng nhập để thực hiện check-out.',
      });
    }

    // 2. Gọi service thực hiện check-out (phớt lờ mọi trường từ req.body nhằm chống giả mạo)
    const result = await attendanceService.performCheckOut({
      userId: req.user.userId,
      userEmployeeId: req.user.employeeId,
    });

    // 3. Trả về phản hồi thành công (HTTP 200 OK)
    return successResponse(res, {
      statusCode: 200,
      message: 'Check-out thành công',
      data: result,
    });
  } catch (error) {
    if (error instanceof AttendanceServiceError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
        details: error.details,
      });
    }
    next(error);
  }
}

/**
 * Lấy bảng chấm công hôm nay theo quyền (RBAC)
 * GET /api/attendance/today hoặc GET /api/attendances/today
 * - EMPLOYEE: Chỉ xem bản ghi hôm nay của chính mình (hoặc data: null nếu chưa check-in)
 * - ADMIN / HR_MANAGER: Xem danh sách toàn công ty kèm thống kê summary
 */
export async function getToday(req, res, next) {
  try {
    if (!req.user || !req.user.userId) {
      return errorResponse(res, {
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
        message: 'Vui lòng đăng nhập để xem thông tin chấm công.',
      });
    }

    const result = await attendanceService.getTodayAttendance({
      userId: req.user.userId,
      userEmployeeId: req.user.employeeId,
      userRole: req.user.role,
    });

    // Với Admin/HR Manager, trả thêm trường summary
    if (result.role === 'ADMIN' || result.role === 'HR_MANAGER') {
      return res.status(200).json({
        success: true,
        status: 'success',
        statusCode: 200,
        message: result.message,
        data: result.data,
        summary: result.summary,
        timestamp: new Date().toISOString(),
      });
    }

    // Với Employee
    return successResponse(res, {
      statusCode: 200,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    if (error instanceof AttendanceServiceError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
        details: error.details,
      });
    }
    next(error);
  }
}

/**
 * Lấy lịch sử chấm công theo tháng/năm có phân trang và thống kê tổng hợp (US 19.0)
 * GET /api/attendance/history hoặc GET /api/attendances/history
 * Query parameters:
 * - month: tháng cần xem (1 - 12)
 * - year: năm cần xem (1900 - 2100)
 * - employeeId: ID nhân viên (dành cho Admin/HR Manager)
 * - page: số trang (mặc định 1)
 * - limit: số bản ghi mỗi trang (mặc định 31)
 */
export async function getHistory(req, res, next) {
  try {
    // 1. Kiểm tra xác thực token người dùng
    if (!req.user || !req.user.userId) {
      return errorResponse(res, {
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
        message: 'Vui lòng đăng nhập để xem lịch sử chấm công.',
      });
    }

    // 2. Gọi service xử lý nghiệp vụ
    const result = await attendanceService.getAttendanceHistory({
      user: req.user,
      queryParams: req.query,
    });

    // 3. Trả về response JSON chuẩn cấu trúc
    return res.status(200).json({
      success: true,
      status: 'success',
      statusCode: 200,
      message: 'Lấy lịch sử chấm công thành công',
      filters: result.filters,
      summary: result.summary,
      pagination: result.pagination,
      data: result.data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AttendanceServiceError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
        details: error.details,
      });
    }
    next(error);
  }
}

export default {
  checkIn,
  checkOut,
  getToday,
  getHistory,
};

