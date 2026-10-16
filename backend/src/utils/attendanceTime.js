/**
 * Tiện ích xử lý thời gian và phân loại chấm công theo múi giờ Việt Nam (Asia/Ho_Chi_Minh)
 * Áp dụng mốc kiểm tra 08:30:00:
 * - Check-in <= 08:30:00 -> ON_TIME (Đúng giờ)
 * - Check-in >  08:30:00 -> LATE (Đi muộn)
 */

export const VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const CUTOFF_HOUR = 8;
export const CUTOFF_MINUTE = 30;
export const CUTOFF_SECOND = 0;
export const CUTOFF_TOTAL_SECONDS = CUTOFF_HOUR * 3600 + CUTOFF_MINUTE * 60 + CUTOFF_SECOND; // 30600 giây (08:30:00)

// Mốc giờ kết thúc ca làm việc tiêu chuẩn (17:30:00)
export const SHIFT_END_HOUR = 17;
export const SHIFT_END_MINUTE = 30;
export const SHIFT_END_SECOND = 0;
export const SHIFT_END_TOTAL_SECONDS = SHIFT_END_HOUR * 3600 + SHIFT_END_MINUTE * 60 + SHIFT_END_SECOND; // 63000 giây (17:30:00)

/**
 * Trích xuất các thành phần ngày/giờ theo múi giờ Việt Nam (+07:00)
 * Hoàn toàn độc lập với múi giờ của máy chủ server hay thiết bị client.
 * 
 * @param {Date|string|number} [date=new Date()]
 * @returns {object} Thông tin chi tiết về ngày làm việc, giờ chấm công và trạng thái
 */
export function getVietnamAttendanceInfo(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Thời điểm cung cấp không hợp lệ để tính toán chấm công.');
  }

  // Sử dụng chuẩn Intl.DateTimeFormat để chuyển đổi sang múi giờ Asia/Ho_Chi_Minh
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(d).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  const hourStr = parts.hour;
  const minuteStr = parts.minute;
  const secondStr = parts.second;

  const h = Number.parseInt(hourStr, 10);
  const m = Number.parseInt(minuteStr, 10);
  const s = Number.parseInt(secondStr, 10);

  const workDate = `${year}-${month}-${day}`;
  const timeString = `${hourStr}:${minuteStr}:${secondStr}`;
  const isoTime = `${workDate}T${timeString}+07:00`;

  // Tổng số giây tính từ đầu ngày theo giờ địa phương Việt Nam
  const totalSecondsInDay = h * 3600 + m * 60 + s;

  // Quy tắc phân loại:
  // <= 08:30:00 -> ON_TIME
  // > 08:30:00 -> LATE
  const isLate = totalSecondsInDay > CUTOFF_TOTAL_SECONDS;
  const status = isLate ? 'LATE' : 'ON_TIME';
  const dbStatus = isLate ? 'Late' : 'OnTime';

  return {
    workDate,
    checkInTimeString: timeString,
    checkInIso: isoTime,
    timeString,
    isoTime,
    status,
    dbStatus,
    isLate,
    hours: h,
    minutes: m,
    seconds: s,
    totalSecondsInDay,
    timeZone: VIETNAM_TIMEZONE,
  };
}

/**
 * Định dạng thời gian chấm công sang chuỗi chuẩn ISO 8601 kèm múi giờ Việt Nam (+07:00)
 * Ví dụ: workDate '2026-10-16', timeStr '08:25:00' -> '2026-10-16T08:25:00+07:00'
 * 
 * @param {string|Date} dateOrStr - Ngày làm việc (YYYY-MM-DD hoặc Date)
 * @param {string|null} timeStr - Giờ dạng HH:mm:ss hoặc HH:mm
 * @returns {string|null} Chuỗi ISO 8601 có múi giờ +07:00 hoặc null nếu timeStr là null
 */
export function formatToVietnamIso(dateOrStr, timeStr) {
  if (!timeStr) return null;

  // Nếu timeStr đã là chuỗi ISO hoàn chỉnh có ký tự T và offset
  if (typeof timeStr === 'string' && timeStr.includes('T')) {
    return timeStr;
  }

  let datePart = dateOrStr;
  if (dateOrStr instanceof Date) {
    const info = getVietnamAttendanceInfo(dateOrStr);
    datePart = info.workDate;
  } else if (typeof dateOrStr === 'string') {
    datePart = dateOrStr.slice(0, 10);
  }

  const rawTime = String(timeStr).trim();
  const timeFormatted = rawTime.length === 5 ? `${rawTime}:00` : rawTime;

  return `${datePart}T${timeFormatted}+07:00`;
}

/**
 * Lấy tháng và năm hiện tại theo múi giờ Việt Nam (Asia/Ho_Chi_Minh)
 * Hoàn toàn độc lập với múi giờ máy chủ hoặc client.
 * 
 * @param {Date|string|number} [date=new Date()]
 * @returns {{ year: number, month: number }}
 */
export function getCurrentVietnamMonthYear(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Thời điểm cung cấp không hợp lệ.');
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
  });

  const parts = formatter.formatToParts(d).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    year: Number.parseInt(parts.year, 10),
    month: Number.parseInt(parts.month, 10),
  };
}

/**
 * Tính toán khoảng ngày [startDate, endDate) của tháng theo chuẩn ISO YYYY-MM-DD
 * Sử dụng ranh giới [đầu tháng, đầu tháng tiếp theo) để tối ưu index SQL
 * 
 * @param {number} year - Năm (vd: 2026)
 * @param {number} month - Tháng (1 - 12)
 * @returns {{ startDate: string, endDate: string, lastDayOfMonth: number }}
 */
export function getMonthDateRange(year, month) {
  const y = Number.parseInt(year, 10);
  const m = Number.parseInt(month, 10);

  if (!Number.isInteger(y) || y < 1900 || y > 2100) {
    throw new Error('Năm không hợp lệ. Năm phải là số nguyên trong khoảng 1900-2100.');
  }

  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error('Tháng không hợp lệ. Tháng phải là số nguyên từ 1 đến 12.');
  }

  const startMonthStr = String(m).padStart(2, '0');
  const startDate = `${y}-${startMonthStr}-01`;

  let nextYear = y;
  let nextMonth = m + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear = y + 1;
  }
  const nextMonthStr = String(nextMonth).padStart(2, '0');
  const endDate = `${nextYear}-${nextMonthStr}-01`;

  // Tính số ngày tối đa trong tháng (28, 29, 30 hoặc 31)
  const lastDayDate = new Date(Date.UTC(y, m, 0));
  const lastDayOfMonth = lastDayDate.getUTCDate();

  return {
    startDate,
    endDate,
    lastDayOfMonth,
  };
}

/**
 * Đánh giá các cờ nghiệp vụ đi muộn (isLate) và về sớm (isEarlyLeave) từ thông tin chấm công
 * Quy tắc:
 * - isLate:
 *     + attendance_status là 'Late' hoặc 'LATE'
 *     + Hoặc checkInTime > 08:30:00
 * - isEarlyLeave:
 *     + Chỉ tính khi có checkOutTime (không suy đoán nếu chưa check-out)
 *     + attendance_status là 'EarlyLeave' hoặc 'EARLY_LEAVE'
 *     + Hoặc checkOutTime < 17:30:00
 * 
 * @param {object} params
 * @param {string|null} params.checkInTime - Giờ vào (HH:mm:ss)
 * @param {string|null} params.checkOutTime - Giờ ra (HH:mm:ss)
 * @param {string|null} params.status - Trạng thái lưu trong DB (OnTime, Late, EarlyLeave, Absent)
 * @returns {{ isLate: boolean, isEarlyLeave: boolean, status: string }}
 */
export function evaluateAttendanceRecord({ checkInTime, checkOutTime, status }) {
  const rawStatus = String(status || '').toUpperCase();

  // 1. Phân loại đi muộn (Check-in > 08:30:00)
  let isLate = rawStatus === 'LATE';
  if (!isLate && checkInTime) {
    const timeParts = String(checkInTime).trim().split(':').map(Number);
    const h = timeParts[0] || 0;
    const m = timeParts[1] || 0;
    const s = timeParts[2] || 0;
    const totalSeconds = h * 3600 + m * 60 + s;
    if (totalSeconds > CUTOFF_TOTAL_SECONDS) {
      isLate = true;
    }
  }

  // 2. Phân loại về sớm (Check-out < 17:30:00)
  let isEarlyLeave = false;
  if (checkOutTime) {
    if (rawStatus === 'EARLYLEAVE' || rawStatus === 'EARLY_LEAVE') {
      isEarlyLeave = true;
    } else {
      const timeParts = String(checkOutTime).trim().split(':').map(Number);
      const h = timeParts[0] || 0;
      const m = timeParts[1] || 0;
      const s = timeParts[2] || 0;
      const totalSeconds = h * 3600 + m * 60 + s;
      if (totalSeconds < SHIFT_END_TOTAL_SECONDS) {
        isEarlyLeave = true;
      }
    }
  }

  // 3. Chuẩn hóa trạng thái hiển thị
  let displayStatus = 'ON_TIME';
  if (isLate) {
    displayStatus = 'LATE';
  } else if (isEarlyLeave) {
    displayStatus = 'EARLY_LEAVE';
  }

  return {
    isLate,
    isEarlyLeave,
    status: displayStatus,
  };
}

export default {
  VIETNAM_TIMEZONE,
  CUTOFF_HOUR,
  CUTOFF_MINUTE,
  CUTOFF_SECOND,
  CUTOFF_TOTAL_SECONDS,
  SHIFT_END_HOUR,
  SHIFT_END_MINUTE,
  SHIFT_END_SECOND,
  SHIFT_END_TOTAL_SECONDS,
  getVietnamAttendanceInfo,
  formatToVietnamIso,
  getCurrentVietnamMonthYear,
  getMonthDateRange,
  evaluateAttendanceRecord,
};

