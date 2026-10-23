import dashboardRepository from '../repositories/dashboardRepository.js';
import { getVietnamAttendanceInfo } from '../utils/attendanceTime.js';

/**
 * SERVICE: DASHBOARD SERVICE LAYER
 * Xử lý logic nghiệp vụ tính toán chỉ số thống kê Dashboard HRM.
 * 
 * QUY TẮC TÍNH TOÁN KPI:
 * 1. Tổng nhân sự (totalEmployees):
 *    - Đếm số nhân viên đang làm việc (employment_status = 'Active').
 *    - Không tính nhân viên đã thôi việc (Resigned).
 *    - Không tính từ bảng Users để phản ánh chính xác số nhân sự thực tế.
 * 
 * 2. Tổng phòng ban (totalDepartments):
 *    - Đếm số phòng ban đang hoạt động (is_active = 1).
 *    - Loại trừ các phòng ban đã ngừng hoạt động / soft-deleted.
 * 
 * 3. Tỷ lệ có mặt hôm nay (attendanceRate):
 *    - Định nghĩa: Tỷ lệ phần trăm nhân viên đang làm việc đã có bản ghi check-in trong ngày hôm nay.
 *    - Công thức: attendanceRate = (presentEmployees / totalEmployees) * 100
 *    - presentEmployees: Số nhân viên đang làm việc đã check-in hôm nay (mỗi nhân viên chỉ tính tối đa 1 lần).
 *    - Ngày thống kê: Ngày hiện tại theo múi giờ Việt Nam (Asia/Ho_Chi_Minh).
 *    - Không tính nhân viên đã thôi việc vào mẫu số lẫn tử số.
 *    - Nếu totalEmployees = 0, trả về tỷ lệ 0 để tránh lỗi chia cho 0.
 *    - Làm tròn tỷ lệ đến 2 chữ số thập phân.
 *    - Lưu ý: Đây là tỷ lệ nhân viên đã check-in hôm nay, không đồng nghĩa với số người đang có mặt tại bàn làm việc ở thời điểm truy vấn.
 */

/**
 * Lấy số liệu thống kê tổng quan cho Dashboard
 * @param {object} [options={}]
 * @param {string|Date} [options.date=null] - Ngày tùy chọn (mặc định là ngày hôm nay theo múi giờ Việt Nam)
 * @returns {Promise<{ totalEmployees: number, totalDepartments: number, presentEmployees: number, attendanceRate: number, date: string }>}
 */
export async function getDashboardStats(options = {}) {
  // 1. Xác định ngày làm việc theo chuẩn múi giờ Việt Nam (Asia/Ho_Chi_Minh)
  let workDate;
  if (options.date) {
    if (typeof options.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
      workDate = options.date;
    } else {
      const timeInfo = getVietnamAttendanceInfo(options.date);
      workDate = timeInfo.workDate;
    }
  } else {
    const timeInfo = getVietnamAttendanceInfo();
    workDate = timeInfo.workDate;
  }

  // 2. Truy vấn dữ liệu thống kê từ CSDL thông qua repository
  const stats = await dashboardRepository.getDashboardStats(workDate);

  const totalEmployees = Math.max(0, Number.parseInt(stats.totalEmployees, 10) || 0);
  const totalDepartments = Math.max(0, Number.parseInt(stats.totalDepartments, 10) || 0);
  const presentEmployees = Math.max(0, Number.parseInt(stats.presentEmployees, 10) || 0);

  // 3. Tính toán tỷ lệ có mặt (attendanceRate)
  // Nếu tổng nhân sự = 0, trả về 0 để tránh lỗi chia cho 0 (Division by Zero)
  const attendanceRate = totalEmployees > 0
    ? Number(((presentEmployees / totalEmployees) * 100).toFixed(2))
    : 0;

  return {
    totalEmployees,
    totalDepartments,
    presentEmployees,
    attendanceRate,
    date: workDate,
  };
}

/**
 * Thống kê tỷ lệ chấm công đúng giờ theo từng phòng ban theo khoảng thời gian ('today' | '7days' | 'month')
 * @param {string} [range='today']
 * @returns {Promise<{ filter: string, startDate: string, endDate: string, totalCheckIns: number, totalOnTime: number, averageRate: number, items: Array }>}
 */
export async function getDepartmentOnTimeStats(range = 'today') {
  const timeInfo = getVietnamAttendanceInfo();
  const today = timeInfo.workDate;

  let startDate = today;
  let endDate = today;

  if (range === '7days') {
    const [y, m, d] = today.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    dateObj.setUTCDate(dateObj.getUTCDate() - 6);
    const pastYear = dateObj.getUTCFullYear();
    const pastMonth = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const pastDay = String(dateObj.getUTCDate()).padStart(2, '0');
    startDate = `${pastYear}-${pastMonth}-${pastDay}`;
    endDate = today;
  } else if (range === 'month') {
    const [y, m] = today.split('-');
    startDate = `${y}-${m}-01`;
    endDate = today;
  } else {
    startDate = today;
    endDate = today;
  }

  const items = await dashboardRepository.getDepartmentOnTimeRates(startDate, endDate);

  let totalCheckIns = 0;
  let totalOnTime = 0;
  items.forEach((item) => {
    totalCheckIns += item.totalCheckIns;
    totalOnTime += item.onTimeCount;
  });

  const averageRate = totalCheckIns > 0
    ? Number(((totalOnTime / totalCheckIns) * 100).toFixed(1))
    : 0;

  return {
    filter: range,
    startDate,
    endDate,
    totalCheckIns,
    totalOnTime,
    averageRate,
    items,
  };
}

export default {
  getDashboardStats,
  getDepartmentOnTimeStats,
};
