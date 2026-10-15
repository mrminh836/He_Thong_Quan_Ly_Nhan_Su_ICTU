import attendanceRepository from '../repositories/attendanceRepository.js';
import employeeRepository from '../repositories/employeeRepository.js';
import userRepository from '../repositories/userRepository.js';
import { getVietnamAttendanceInfo } from '../utils/attendanceTime.js';

/**
 * Service xử lý nghiệp vụ Chấm công (Attendance Service)
 */

/**
 * Lớp lỗi tùy chỉnh cho nghiệp vụ chấm công
 */
export class AttendanceServiceError extends Error {
  constructor({ message, statusCode = 400, errorCode = 'BAD_REQUEST', details = null }) {
    super(message);
    this.name = 'AttendanceServiceError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}

/**
 * Thực hiện chấm công vào ca (Check-in) cho nhân viên
 * Tự động phân loại đúng giờ (ON_TIME) hoặc đi muộn (LATE) theo mốc 08:30:00 múi giờ Việt Nam.
 * Ngăn chặn check-in nhiều lần trong cùng một ngày làm việc (409 Conflict).
 * 
 * @param {object} params
 * @param {number} params.userId - ID tài khoản đăng nhập (lấy từ JWT token)
 * @param {number} [params.userEmployeeId] - ID nhân viên liên kết từ phiên đăng nhập
 * @param {Date|string|number} [params.currentTime=new Date()] - Thời điểm chấm công (mặc định lấy đồng hồ server)
 * @returns {Promise<object>} Dữ liệu chấm công vừa tạo
 */
export async function performCheckIn({ userId, userEmployeeId, currentTime = new Date() }) {
  // 1. Xác định EmployeeID hợp lệ từ tài khoản
  let employeeId = userEmployeeId;

  if (!employeeId) {
    const user = await userRepository.findById(userId);
    if (!user || !user.employee_id) {
      throw new AttendanceServiceError({
        statusCode: 404,
        errorCode: 'EMPLOYEE_NOT_LINKED',
        message: 'Tài khoản chưa được liên kết với hồ sơ nhân viên để thực hiện chấm công.',
      });
    }
    employeeId = user.employee_id;
  }

  // 2. Xác minh hồ sơ nhân sự tồn tại và đang hoạt động
  const employee = await employeeRepository.findById(employeeId);
  if (!employee) {
    throw new AttendanceServiceError({
      statusCode: 404,
      errorCode: 'EMPLOYEE_NOT_FOUND',
      message: 'Không tìm thấy hồ sơ nhân viên tương ứng trong hệ thống.',
    });
  }

  if (employee.employment_status === 'Resigned') {
    throw new AttendanceServiceError({
      statusCode: 403,
      errorCode: 'EMPLOYEE_RESIGNED',
      message: 'Hồ sơ nhân viên đã thôi việc, không thể thực hiện chấm công.',
    });
  }

  // 3. Phân tích thời gian và phân loại trạng thái theo múi giờ Việt Nam (Asia/Ho_Chi_Minh)
  const timeInfo = getVietnamAttendanceInfo(currentTime);
  const { workDate, checkInTimeString, checkInIso, status, dbStatus, isLate } = timeInfo;

  // 4. Kiểm tra trước xem nhân viên đã check-in trong ngày làm việc này chưa
  const existingAttendance = await attendanceRepository.findByEmployeeAndDate(employeeId, workDate);
  if (existingAttendance) {
    const existingStatus = (existingAttendance.attendance_status === 'Late' || existingAttendance.attendance_status === 'LATE')
      ? 'LATE'
      : 'ON_TIME';

    throw new AttendanceServiceError({
      statusCode: 409,
      errorCode: 'ALREADY_CHECKED_IN',
      message: 'Bạn đã check-in hôm nay.',
      details: {
        attendanceId: existingAttendance.attendance_id,
        employeeId,
        workDate: existingAttendance.attendance_date,
        checkInTime: existingAttendance.check_in,
        status: existingStatus,
      },
    });
  }

  // 5. Lưu bản ghi check-in vào CSDL
  let insertedId;
  try {
    insertedId = await attendanceRepository.createCheckIn({
      employeeId,
      workDate,
      checkInTime: checkInTimeString,
      status: dbStatus,
      note: isLate ? 'Check-in đi muộn' : 'Check-in đúng giờ tiêu chuẩn',
    });
  } catch (error) {
    // 6. Xử lý trường hợp race condition (2 request gửi cùng một lúc vượt qua bước kiểm tra SELECT)
    if (error.isDuplicate || error.code === 'ER_DUP_ENTRY') {
      const raceExisting = await attendanceRepository.findByEmployeeAndDate(employeeId, workDate);
      throw new AttendanceServiceError({
        statusCode: 409,
        errorCode: 'ALREADY_CHECKED_IN',
        message: 'Bạn đã check-in hôm nay.',
        details: raceExisting ? {
          attendanceId: raceExisting.attendance_id,
          employeeId,
          workDate: raceExisting.attendance_date,
          checkInTime: raceExisting.check_in,
          status: (raceExisting.attendance_status === 'Late' || raceExisting.attendance_status === 'LATE') ? 'LATE' : 'ON_TIME',
        } : null,
      });
    }
    throw error;
  }

  // 7. Định dạng kết quả thành công đồng bộ theo đặc tả API
  return {
    attendanceId: insertedId,
    employeeId,
    workDate,
    checkInTime: checkInIso,
    status, // Luôn là 'ON_TIME' hoặc 'LATE'
    isLate,
    message: isLate ? 'Check-in thành công. Bạn đã đi muộn.' : 'Check-in thành công',
  };
}

export default {
  performCheckIn,
  AttendanceServiceError,
};
