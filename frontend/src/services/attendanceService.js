import { api } from './api.js';
import { getCurrentUser } from './authService.js';

/**
 * Service giao tiếp với Backend API Chấm công (Attendance Service)
 * Hỗ trợ các endpoint:
 *   - GET /api/attendance/today (lấy trạng thái chấm công hôm nay)
 *   - POST /api/attendance/check-in (thực hiện check-in)
 *   - POST /api/attendance/check-out (thực hiện check-out)
 */

export const attendanceService = {
  /**
   * Lấy dữ liệu chấm công hôm nay
   * - Vai trò EMPLOYEE: Backend trả về { data: object | null }
   * - Vai trò ADMIN / HR: Backend trả về { data: Array, summary: Object }
   * 
   * @returns {Promise<object>} Response từ backend
   */
  async getTodayAttendance() {
    try {
      return await api.get('/attendance/today');
    } catch (err) {
      // Fallback nếu route là /attendances/today
      if (err.status === 404) {
        return await api.get('/attendances/today');
      }
      throw err;
    }
  },

  /**
   * Thực hiện Check-in vào ca làm việc
   * Backend tự động xác định nhân viên từ token và phân loại ON_TIME / LATE
   * 
   * @returns {Promise<object>}
   */
  async checkIn() {
    try {
      return await api.post('/attendance/check-in', {});
    } catch (err) {
      if (err.status === 404) {
        return await api.post('/attendances/check-in', {});
      }
      throw err;
    }
  },

  /**
   * Thực hiện Check-out kết thúc ca làm việc
   * Backend tự động xác định thời gian và ghi nhận vào CSDL
   * 
   * @returns {Promise<object>}
   */
  async checkOut() {
    try {
      return await api.post('/attendance/check-out', {});
    } catch (err) {
      if (err.status === 404) {
        return await api.post('/attendances/check-out', {});
      }
      throw err;
    }
  },

  /**
   * Trích xuất bản ghi chấm công cá nhân của người dùng hiện tại từ response backend.
   * Ngăn chặn trường hợp tài khoản Admin/HR nhận mảng toàn công ty làm sai lệch thông tin widget cá nhân.
   * 
   * @param {object} response - Phản hồi từ getTodayAttendance()
   * @param {object} [user] - Người dùng hiện tại (mặc định lấy từ authService.getCurrentUser())
   * @returns {object|null} Bản ghi chấm công của cá nhân hoặc null nếu chưa check-in
   */
  extractPersonalRecord(response, user = getCurrentUser()) {
    if (!response || !response.data) {
      return null;
    }

    // Nếu data là một mảng (Admin/HR Manager view)
    if (Array.isArray(response.data)) {
      if (!user) return null;
      const targetEmpId = user.employeeId || user.employee_id || user.id;

      // Tìm kiếm theo employeeId hoặc employeeCode
      const matched = response.data.find(
        (item) =>
          (item.employeeId && targetEmpId && Number(item.employeeId) === Number(targetEmpId)) ||
          (item.employee_id && targetEmpId && Number(item.employee_id) === Number(targetEmpId)) ||
          (item.employeeCode && user.username && item.employeeCode.toLowerCase() === user.username.toLowerCase()) ||
          (item.employee_code && user.username && item.employee_code.toLowerCase() === user.username.toLowerCase())
      );

      // Nếu tìm thấy và đã check-in
      if (matched && matched.checkInTime) {
        return matched;
      }
      return null;
    }

    // Nếu data là một object đơn (Employee view)
    return response.data;
  },
};

export default attendanceService;
