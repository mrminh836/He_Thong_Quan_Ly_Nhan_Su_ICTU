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
export const CUTOFF_TOTAL_SECONDS = CUTOFF_HOUR * 3600 + CUTOFF_MINUTE * 60 + CUTOFF_SECOND; // 30600 giây

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

export default {
  VIETNAM_TIMEZONE,
  CUTOFF_HOUR,
  CUTOFF_MINUTE,
  CUTOFF_SECOND,
  CUTOFF_TOTAL_SECONDS,
  getVietnamAttendanceInfo,
  formatToVietnamIso,
};
