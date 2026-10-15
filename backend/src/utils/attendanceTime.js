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
  const checkInTimeString = `${hourStr}:${minuteStr}:${secondStr}`;
  const checkInIso = `${workDate}T${checkInTimeString}+07:00`;

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
    checkInTimeString,
    checkInIso,
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

export default {
  VIETNAM_TIMEZONE,
  CUTOFF_HOUR,
  CUTOFF_MINUTE,
  CUTOFF_SECOND,
  CUTOFF_TOTAL_SECONDS,
  getVietnamAttendanceInfo,
};
