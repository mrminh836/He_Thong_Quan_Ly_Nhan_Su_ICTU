import attendanceRepository from '../repositories/attendanceRepository.js';
import employeeRepository from '../repositories/employeeRepository.js';
import userRepository from '../repositories/userRepository.js';
import { getVietnamAttendanceInfo, formatToVietnamIso } from '../utils/attendanceTime.js';

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

/**
 * Thực hiện chấm công kết thúc ca làm việc (Check-out) cho nhân viên
 * Quy tắc:
 * - Chỉ cho phép check-out sau khi đã check-in trong ngày.
 * - Mỗi nhân viên chỉ được check-out 1 lần duy nhất trong ngày làm việc (409 Conflict).
 * - Sử dụng câu lệnh UPDATE có điều kiện để chống race condition.
 * - Giữ nguyên trạng thái ON_TIME / LATE đã xác định lúc Check-in.
 * 
 * @param {object} params
 * @param {number} params.userId - ID người dùng
 * @param {number} [params.userEmployeeId] - ID nhân viên
 * @param {Date|string|number} [params.currentTime=new Date()] - Thời điểm check-out
 * @returns {Promise<object>} Dữ liệu chấm công đã check-out
 */
export async function performCheckOut({ userId, userEmployeeId, currentTime = new Date() }) {
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

  // 2. Xác minh hồ sơ nhân sự tồn tại
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

  // 3. Lấy thông tin ngày làm việc và giờ check-out hiện tại theo giờ Việt Nam
  const timeInfo = getVietnamAttendanceInfo(currentTime);
  const { workDate, timeString } = timeInfo;

  // 4. Tìm kiếm bản ghi chấm công của nhân viên trong ngày làm việc
  const existingAttendance = await attendanceRepository.findByEmployeeAndDate(employeeId, workDate);
  if (!existingAttendance) {
    throw new AttendanceServiceError({
      statusCode: 404,
      errorCode: 'CHECKIN_REQUIRED',
      message: 'Bạn chưa thực hiện check-in hôm nay.',
    });
  }

  // 5. Kiểm tra nếu đã check-out trước đó
  if (existingAttendance.check_out) {
    throw new AttendanceServiceError({
      statusCode: 409,
      errorCode: 'ALREADY_CHECKED_OUT',
      message: 'Bạn đã check-out hôm nay.',
      details: {
        attendanceId: existingAttendance.attendance_id,
        employeeId,
        workDate: existingAttendance.attendance_date,
        checkInTime: formatToVietnamIso(workDate, existingAttendance.check_in),
        checkOutTime: formatToVietnamIso(workDate, existingAttendance.check_out),
        status: (existingAttendance.attendance_status === 'Late' || existingAttendance.attendance_status === 'LATE') ? 'LATE' : 'ON_TIME',
      },
    });
  }

  // 6. Cập nhật Check-out bằng atomic update có điều kiện (check_out IS NULL)
  const affected = await attendanceRepository.updateCheckOut({
    employeeId,
    workDate,
    checkOutTime: timeString,
  });

  // Nếu không có dòng nào bị ảnh hưởng -> đã có request check-out khác vừa chạy xong (Race condition)
  if (affected === 0) {
    const rechecked = await attendanceRepository.findByEmployeeAndDate(employeeId, workDate);
    if (rechecked && rechecked.check_out) {
      throw new AttendanceServiceError({
        statusCode: 409,
        errorCode: 'ALREADY_CHECKED_OUT',
        message: 'Bạn đã check-out hôm nay.',
        details: {
          attendanceId: rechecked.attendance_id,
          employeeId,
          workDate: rechecked.attendance_date,
          checkInTime: formatToVietnamIso(workDate, rechecked.check_in),
          checkOutTime: formatToVietnamIso(workDate, rechecked.check_out),
          status: (rechecked.attendance_status === 'Late' || rechecked.attendance_status === 'LATE') ? 'LATE' : 'ON_TIME',
        },
      });
    }

    throw new AttendanceServiceError({
      statusCode: 404,
      errorCode: 'CHECKIN_REQUIRED',
      message: 'Bạn chưa thực hiện check-in hôm nay.',
    });
  }

  // 7. Định dạng kết quả trả về
  const status = (existingAttendance.attendance_status === 'Late' || existingAttendance.attendance_status === 'LATE')
    ? 'LATE'
    : 'ON_TIME';

  return {
    attendanceId: existingAttendance.attendance_id,
    employeeId,
    workDate,
    checkInTime: formatToVietnamIso(workDate, existingAttendance.check_in),
    checkOutTime: formatToVietnamIso(workDate, timeString),
    status,
  };
}

/**
 * Lấy bảng chấm công hôm nay theo phân quyền RBAC
 * - EMPLOYEE: Chỉ lấy bản ghi của chính mình (nếu chưa chấm công trả data: null)
 * - ADMIN / HR_MANAGER: Lấy toàn bộ danh sách nhân viên công ty (LEFT JOIN) kèm tóm tắt summary
 * 
 * @param {object} params
 * @param {number} params.userId
 * @param {number} [params.userEmployeeId]
 * @param {string} params.userRole - 'ADMIN' | 'HR_MANAGER' | 'EMPLOYEE'
 * @param {Date|string|number} [params.currentTime=new Date()]
 * @returns {Promise<object>}
 */
export async function getTodayAttendance({ userId, userEmployeeId, userRole, currentTime = new Date() }) {
  const timeInfo = getVietnamAttendanceInfo(currentTime);
  const { workDate } = timeInfo;

  // 1. Phân quyền: Nhân viên thường (EMPLOYEE) chỉ xem thông tin cá nhân
  if (userRole === 'EMPLOYEE') {
    let employeeId = userEmployeeId;
    if (!employeeId) {
      const user = await userRepository.findById(userId);
      if (!user || !user.employee_id) {
        throw new AttendanceServiceError({
          statusCode: 404,
          errorCode: 'EMPLOYEE_NOT_LINKED',
          message: 'Tài khoản chưa được liên kết với hồ sơ nhân viên để thực hiện xem chấm công.',
        });
      }
      employeeId = user.employee_id;
    }

    const record = await attendanceRepository.findByEmployeeAndDate(employeeId, workDate);
    if (!record) {
      return {
        role: 'EMPLOYEE',
        message: 'Lấy chấm công hôm nay thành công',
        data: null,
      };
    }

    const status = (record.attendance_status === 'Late' || record.attendance_status === 'LATE')
      ? 'LATE'
      : 'ON_TIME';

    return {
      role: 'EMPLOYEE',
      message: 'Lấy chấm công hôm nay thành công',
      data: {
        attendanceId: record.attendance_id,
        employeeId,
        workDate,
        checkInTime: formatToVietnamIso(workDate, record.check_in),
        checkOutTime: formatToVietnamIso(workDate, record.check_out),
        status,
      },
    };
  }

  // 2. Phân quyền: Quản trị viên (ADMIN / HR_MANAGER) xem toàn bộ bảng chấm công công ty
  const rows = await attendanceRepository.getTodayAttendanceBoard(workDate);

  const formattedRows = rows.map((row) => {
    const hasCheckIn = Boolean(row.check_in);
    const hasCheckOut = Boolean(row.check_out);
    const status = hasCheckIn
      ? ((row.attendance_status === 'Late' || row.attendance_status === 'LATE') ? 'LATE' : 'ON_TIME')
      : null;

    return {
      attendanceId: row.attendance_id || null,
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      fullName: row.full_name,
      departmentId: row.department_id,
      departmentName: row.department_name,
      workDate,
      checkInTime: hasCheckIn ? formatToVietnamIso(workDate, row.check_in) : null,
      checkOutTime: hasCheckOut ? formatToVietnamIso(workDate, row.check_out) : null,
      status,
    };
  });

  // Tính toán tóm tắt chỉ số thực tế
  const totalEmployees = formattedRows.length;
  const checkedIn = formattedRows.filter((r) => r.checkInTime !== null).length;
  const checkedOut = formattedRows.filter((r) => r.checkOutTime !== null).length;
  const late = formattedRows.filter((r) => r.status === 'LATE').length;
  const notCheckedIn = formattedRows.filter((r) => r.checkInTime === null).length;

  return {
    role: userRole,
    message: 'Lấy bảng chấm công hôm nay thành công',
    data: formattedRows,
    summary: {
      totalEmployees,
      checkedIn,
      checkedOut,
      late,
      notCheckedIn,
    },
  };
}

export default {
  performCheckIn,
  performCheckOut,
  getTodayAttendance,
  AttendanceServiceError,
};
