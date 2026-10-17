import dashboardService from '../services/dashboardService.js';
import { successResponse } from '../utils/response.js';

/**
 * CONTROLLER: DASHBOARD CONTROLLER
 * Xử lý tiếp nhận request và trả về response cho các API Dashboard.
 */

/**
 * GET /api/dashboard/stats
 * Thống kê các chỉ số KPI tổng quan cho Dashboard HRM:
 * - Tổng số nhân viên đang làm việc (totalEmployees)
 * - Tổng số phòng ban đang hoạt động (totalDepartments)
 * - Số nhân viên đang làm việc đã check-in hôm nay (presentEmployees)
 * - Tỷ lệ có mặt hôm nay (attendanceRate)
 * - Ngày thống kê theo múi giờ Việt Nam (date)
 */
export async function getStats(req, res, next) {
  try {
    const stats = await dashboardService.getDashboardStats();

    return successResponse(res, {
      message: 'Lấy dữ liệu thống kê dashboard thành công',
      data: stats,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getStats,
};
