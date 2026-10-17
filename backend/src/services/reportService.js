import reportRepository from '../repositories/reportRepository.js';
import userRepository from '../repositories/userRepository.js';
import {
  getCurrentVietnamMonthYear,
  getMonthDateRange,
  evaluateAttendanceRecord,
  getVietnamAttendanceInfo,
} from '../utils/attendanceTime.js';
import { buildAttendanceExcelBuffer } from '../utils/excelHelper.js';
import { buildCsvBuffer } from '../utils/csvHelper.js';

/**
 * LỚP LỖI RIÊNG CHO REPORT SERVICE
 */
export class ReportServiceError extends Error {
  constructor({ statusCode = 400, errorCode = 'BAD_REQUEST', message = 'Lỗi yêu cầu báo cáo' }) {
    super(message);
    this.name = 'ReportServiceError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.code = errorCode;
  }
}

/**
 * SERVICE: REPORT SERVICE LAYER
 * Chịu trách nhiệm xác thực tham số, phân quyền RBAC và xuất báo cáo chấm công ra Excel/CSV.
 */
export async function exportAttendanceReport({ user, queryParams = {} }) {
  // 1. Kiểm tra xác thực token người dùng
  if (!user || !user.userId) {
    throw new ReportServiceError({
      statusCode: 401,
      errorCode: 'UNAUTHORIZED',
      message: 'Vui lòng đăng nhập để thực hiện xuất báo cáo chấm công.',
    });
  }

  // 2. Kiểm tra và chuẩn hóa định dạng xuất (format)
  const rawFormat = String(queryParams.format || 'xlsx').trim().toLowerCase().replace(/^\./, '');
  if (rawFormat !== 'xlsx' && rawFormat !== 'csv') {
    throw new ReportServiceError({
      statusCode: 400,
      errorCode: 'INVALID_FORMAT',
      message: `Định dạng file '${queryParams.format}' không được hỗ trợ. Hệ thống chỉ hỗ trợ xuất định dạng 'xlsx' hoặc 'csv'.`,
    });
  }
  const format = rawFormat;

  // 3. Xác định khoảng thời gian báo cáo
  const { month, year, fromDate, toDate, departmentId, employeeId } = queryParams;

  let startDate;
  let endDate;
  let inclusiveEndDate = false;
  let periodTitle;
  let fileBaseName;

  const hasFromDate = fromDate !== undefined && fromDate !== null && String(fromDate).trim() !== '';
  const hasToDate = toDate !== undefined && toDate !== null && String(toDate).trim() !== '';

  if (hasFromDate || hasToDate) {
    // 3.1. Trường hợp xuất theo khoảng ngày tùy chọn (fromDate, toDate)
    if (!hasFromDate || !hasToDate) {
      throw new ReportServiceError({
        statusCode: 400,
        errorCode: 'INVALID_DATE_RANGE',
        message: 'Vui lòng cung cấp đầy đủ cả ngày bắt đầu (fromDate) và ngày kết thúc (toDate).',
      });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
      throw new ReportServiceError({
        statusCode: 400,
        errorCode: 'INVALID_DATE_FORMAT',
        message: 'Ngày bắt đầu và ngày kết thúc phải có định dạng YYYY-MM-DD.',
      });
    }

    const dFrom = new Date(`${fromDate}T00:00:00+07:00`);
    const dTo = new Date(`${toDate}T00:00:00+07:00`);
    if (Number.isNaN(dFrom.getTime()) || Number.isNaN(dTo.getTime())) {
      throw new ReportServiceError({
        statusCode: 400,
        errorCode: 'INVALID_DATE_VALUE',
        message: 'Ngày cung cấp không phải là ngày hợp lệ trên lịch.',
      });
    }

    if (fromDate > toDate) {
      throw new ReportServiceError({
        statusCode: 400,
        errorCode: 'INVALID_DATE_RANGE',
        message: 'Ngày bắt đầu (fromDate) không được lớn hơn ngày kết thúc (toDate).',
      });
    }

    startDate = fromDate;
    endDate = toDate;
    inclusiveEndDate = true;
    periodTitle = `Từ ngày ${fromDate} đến ngày ${toDate}`;
    fileBaseName = `bao_cao_cham_cong_${fromDate.replace(/-/g, '')}_${toDate.replace(/-/g, '')}`;
  } else {
    // 3.2. Trường hợp xuất theo tháng và năm
    const hasMonth = month !== undefined && month !== null && String(month).trim() !== '';
    const hasYear = year !== undefined && year !== null && String(year).trim() !== '';

    let selectedMonth;
    let selectedYear;

    if (!hasMonth && !hasYear) {
      // Mặc định: Lấy tháng và năm hiện tại theo giờ Việt Nam
      const current = getCurrentVietnamMonthYear();
      selectedMonth = current.month;
      selectedYear = current.year;
    } else if (!hasMonth || !hasYear) {
      throw new ReportServiceError({
        statusCode: 400,
        errorCode: 'INVALID_PARAMS',
        message: 'Vui lòng cung cấp đầy đủ cả hai tham số month và year hoặc để trống cả hai để lấy tháng hiện tại.',
      });
    } else {
      const parsedMonth = Number(month);
      if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
        throw new ReportServiceError({
          statusCode: 400,
          errorCode: 'INVALID_MONTH',
          message: 'Tháng không hợp lệ. Tháng phải là số nguyên từ 1 đến 12.',
        });
      }
      selectedMonth = parsedMonth;

      const parsedYear = Number(year);
      if (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > 2100) {
        throw new ReportServiceError({
          statusCode: 400,
          errorCode: 'INVALID_YEAR',
          message: 'Năm không hợp lệ. Năm phải là số nguyên trong khoảng 1900 đến 2100.',
        });
      }
      selectedYear = parsedYear;
    }

    const dateRange = getMonthDateRange(selectedYear, selectedMonth);
    startDate = dateRange.startDate;
    endDate = dateRange.endDate;
    inclusiveEndDate = false;

    const monthStr = String(selectedMonth).padStart(2, '0');
    periodTitle = `Tháng ${monthStr}/${selectedYear}`;
    fileBaseName = `bao_cao_cham_cong_${selectedYear}_${monthStr}`;
  }

  // 4. Phân quyền và kiểm tra bộ lọc (RBAC)
  let filterDepartmentId = null;
  let filterEmployeeId = null;
  const userRole = user.role;

  if (userRole === 'EMPLOYEE') {
    // Nhân viên thường: BẮT BUỘC chỉ được phép xuất dữ liệu chấm công của chính mình
    let employeeIdSelf = user.employeeId;
    if (!employeeIdSelf) {
      const dbUser = await userRepository.findById(user.userId);
      if (!dbUser || !dbUser.employee_id) {
        throw new ReportServiceError({
          statusCode: 403,
          errorCode: 'EMPLOYEE_NOT_LINKED',
          message: 'Tài khoản chưa được liên kết với hồ sơ nhân viên để xuất báo cáo.',
        });
      }
      employeeIdSelf = dbUser.employee_id;
    }

    // Nếu người dùng vai trò EMPLOYEE cố tình truyền employeeId khác trên query -> Chặn ngay 403 Forbidden
    if (employeeId !== undefined && employeeId !== null && String(employeeId).trim() !== '') {
      if (String(employeeId) !== String(employeeIdSelf)) {
        throw new ReportServiceError({
          statusCode: 403,
          errorCode: 'FORBIDDEN',
          message: 'Bạn chỉ có quyền xuất báo cáo chấm công của chính mình.',
        });
      }
    }

    // Áp đặt phạm vi xuất: Chỉ chính mình, không cho lọc departmentId
    filterEmployeeId = employeeIdSelf;
    filterDepartmentId = null;
  } else if (userRole === 'ADMIN' || userRole === 'HR_MANAGER') {
    // Quản trị viên & Quản lý nhân sự: Được phép lọc theo phòng ban hoặc nhân viên
    if (departmentId !== undefined && departmentId !== null && String(departmentId).trim() !== '') {
      const parsedDeptId = Number(departmentId);
      if (!Number.isInteger(parsedDeptId) || parsedDeptId <= 0) {
        throw new ReportServiceError({
          statusCode: 400,
          errorCode: 'INVALID_DEPARTMENT_ID',
          message: 'Mã phòng ban (departmentId) phải là số nguyên dương.',
        });
      }
      filterDepartmentId = parsedDeptId;
    }

    if (employeeId !== undefined && employeeId !== null && String(employeeId).trim() !== '') {
      const parsedEmpId = Number(employeeId);
      if (!Number.isInteger(parsedEmpId) || parsedEmpId <= 0) {
        throw new ReportServiceError({
          statusCode: 400,
          errorCode: 'INVALID_EMPLOYEE_ID',
          message: 'Mã nhân viên (employeeId) phải là số nguyên dương.',
        });
      }
      filterEmployeeId = parsedEmpId;
    }
  } else {
    throw new ReportServiceError({
      statusCode: 403,
      errorCode: 'FORBIDDEN',
      message: 'Vai trò người dùng không có quyền truy cập chức năng xuất báo cáo.',
    });
  }

  // 5. Truy vấn dữ liệu chi tiết và thống kê tổng hợp từ Repository
  const [rawRows, summary] = await Promise.all([
    reportRepository.getAttendanceReportData({
      startDate,
      endDate,
      inclusiveEndDate,
      departmentId: filterDepartmentId,
      employeeId: filterEmployeeId,
    }),
    reportRepository.getAttendanceReportSummary({
      startDate,
      endDate,
      inclusiveEndDate,
      departmentId: filterDepartmentId,
      employeeId: filterEmployeeId,
    }),
  ]);

  // 6. Ánh xạ dữ liệu, chuẩn hóa trạng thái và tiếng Việt
  const STATUS_LABELS = {
    ON_TIME: 'Đúng giờ',
    LATE: 'Đi muộn',
    EARLY_LEAVE: 'Về sớm',
    LATE_AND_EARLY_LEAVE: 'Đi muộn & Về sớm',
    ABSENT: 'Vắng mặt',
  };

  const formattedRecords = rawRows.map((row) => {
    const evalResult = evaluateAttendanceRecord({
      checkInTime: row.check_in,
      checkOutTime: row.check_out,
      status: row.attendance_status,
    });

    const statusText = STATUS_LABELS[evalResult.status] || 'Đúng giờ';

    return {
      attendanceId: row.attendance_id,
      employeeId: row.employee_id,
      employeeCode: row.employee_code || '',
      employeeName: row.employee_name || '',
      departmentName: row.department_name || 'Chưa phân phòng ban',
      position: row.position || '',
      attendanceDate: row.attendance_date || '',
      checkIn: row.check_in || '',
      checkOut: row.check_out || '',
      statusText,
      note: row.note || '',
    };
  });

  // Lấy thời điểm xuất báo cáo theo giờ Việt Nam
  const nowInfo = getVietnamAttendanceInfo();
  const exportTimeStr = `${nowInfo.workDate} ${nowInfo.timeString}`;

  // 7. Tạo file theo định dạng yêu cầu
  let fileBuffer;
  let fileName;
  let mimeType;

  if (format === 'xlsx') {
    fileBuffer = await buildAttendanceExcelBuffer({
      periodTitle,
      exportTimeStr,
      summary,
      records: formattedRecords,
    });
    fileName = `${fileBaseName}.xlsx`;
    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else {
    // CSV export
    const headers = [
      'STT',
      'Mã nhân viên',
      'Họ và tên',
      'Phòng ban',
      'Chức vụ',
      'Ngày chấm công',
      'Giờ vào',
      'Giờ ra',
      'Trạng thái',
      'Ghi chú',
    ];

    const csvDataRows = formattedRecords.map((rec, idx) => [
      idx + 1,
      rec.employeeCode,
      rec.employeeName,
      rec.departmentName,
      rec.position,
      rec.attendanceDate,
      rec.checkIn || '--:--',
      rec.checkOut || '--:--',
      rec.statusText,
      rec.note,
    ]);

    const additionalLines = [
      `Tổng kết kỳ báo cáo: ${periodTitle}`,
      `Thời điểm xuất: ${exportTimeStr}`,
      `Tổng số bản ghi: ${summary.totalRecords} | Tổng ngày công thực tế: ${summary.totalWorkDays} | Đúng giờ: ${summary.onTimeCount} | Đi muộn: ${summary.lateCount} | Về sớm: ${summary.earlyLeaveCount}`,
    ];

    if (formattedRecords.length === 0) {
      additionalLines.unshift('Không có bản ghi chấm công nào trong kỳ báo cáo đã chọn.');
    }

    fileBuffer = buildCsvBuffer(headers, csvDataRows, additionalLines);
    fileName = `${fileBaseName}.csv`;
    mimeType = 'text/csv; charset=utf-8';
  }

  return {
    fileBuffer,
    fileName,
    mimeType,
    format,
    summary,
    totalRecords: formattedRecords.length,
  };
}

export default {
  exportAttendanceReport,
  ReportServiceError,
};
