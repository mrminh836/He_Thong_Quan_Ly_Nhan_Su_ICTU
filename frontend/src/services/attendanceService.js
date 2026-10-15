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
  async getTodayAttendance(params = {}) {
    const query = new URLSearchParams();
    if (params.search && params.search.trim()) query.append('search', params.search.trim());
    if (params.departmentId && params.departmentId !== 'all') query.append('departmentId', params.departmentId);
    if (params.status && params.status !== 'all') query.append('status', params.status);
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);
    const qs = query.toString() ? `?${query.toString()}` : '';

    try {
      return await api.get(`/attendance/today${qs}`);
    } catch (err) {
      // Fallback nếu route là /attendances/today
      if (err.status === 404) {
        return await api.get(`/attendances/today${qs}`);
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

  /**
   * Tính toán các chỉ số thống kê tổng quan chấm công hôm nay
   * Ưu tiên dữ liệu summary từ backend nếu có, hoặc tính toán chuẩn xác trên toàn bộ danh sách
   * 
   * @param {Array} items - Danh sách toàn bộ nhân viên hôm nay
   * @param {object} [apiSummary] - Đối tượng summary trả về từ API backend
   * @returns {object} { totalEmployees, checkedIn, onTime, late, notCheckedIn, checkedOut }
   */
  calculateAttendanceSummary(items = [], apiSummary = null) {
    if (!Array.isArray(items)) {
      items = [];
    }

    const totalEmployees = (apiSummary && typeof apiSummary.totalEmployees === 'number')
      ? apiSummary.totalEmployees
      : items.length;

    const checkedIn = (apiSummary && typeof apiSummary.checkedIn === 'number')
      ? apiSummary.checkedIn
      : items.filter((i) => Boolean(i.checkInTime)).length;

    const late = (apiSummary && typeof apiSummary.late === 'number')
      ? apiSummary.late
      : items.filter((i) => i.status === 'LATE').length;

    const onTime = items.filter((i) => Boolean(i.checkInTime) && i.status !== 'LATE').length;

    const notCheckedIn = (apiSummary && typeof apiSummary.notCheckedIn === 'number')
      ? apiSummary.notCheckedIn
      : items.filter((i) => !i.checkInTime).length;

    const checkedOut = (apiSummary && typeof apiSummary.checkedOut === 'number')
      ? apiSummary.checkedOut
      : items.filter((i) => Boolean(i.checkOutTime)).length;

    return {
      totalEmployees,
      checkedIn,
      onTime,
      late,
      notCheckedIn,
      checkedOut,
    };
  },

  /**
   * Lọc danh sách chấm công kết hợp đa điều kiện: Tìm kiếm, Phòng ban và Trạng thái
   * 
   * @param {Array} items
   * @param {object} options
   * @param {string} [options.search='']
   * @param {string|number} [options.departmentId='all']
   * @param {string} [options.status='all']
   * @returns {Array} Danh sách đã lọc
   */
  filterAttendanceList(items = [], { search = '', departmentId = 'all', status = 'all' } = {}) {
    if (!Array.isArray(items)) return [];

    const searchKeyword = String(search || '').trim().toLowerCase();

    return items.filter((item) => {
      // 1. Lọc theo từ khóa tìm kiếm (Họ tên hoặc Mã nhân viên)
      if (searchKeyword) {
        const nameMatch = item.fullName && item.fullName.toLowerCase().includes(searchKeyword);
        const codeMatch = item.employeeCode && item.employeeCode.toLowerCase().includes(searchKeyword);
        if (!nameMatch && !codeMatch) {
          return false;
        }
      }

      // 2. Lọc theo phòng ban
      if (departmentId && departmentId !== 'all') {
        if (Number(item.departmentId) !== Number(departmentId)) {
          return false;
        }
      }

      // 3. Lọc theo trạng thái chấm công
      if (status && status !== 'all') {
        const hasCheckIn = Boolean(item.checkInTime);
        const hasCheckOut = Boolean(item.checkOutTime);
        const isLate = item.status === 'LATE';

        switch (status) {
          case 'present': // Đã có mặt (bao gồm cả đúng giờ và đi muộn)
            if (!hasCheckIn) return false;
            break;
          case 'ontime': // Đúng giờ
            if (!hasCheckIn || isLate) return false;
            break;
          case 'late': // Đi muộn
            if (!isLate) return false;
            break;
          case 'not_checked_in': // Chưa check-in
            if (hasCheckIn) return false;
            break;
          case 'checked_out': // Đã check-out
            if (!hasCheckOut) return false;
            break;
          default:
            break;
        }
      }

      return true;
    });
  },

  /**
   * Phân trang danh sách chấm công
   * 
   * @param {Array} items
   * @param {number} [page=1]
   * @param {number} [limit=10]
   * @returns {object} { page, limit, total, totalPages, items, startIndex, endIndex }
   */
  paginateAttendanceList(items = [], page = 1, limit = 10) {
    if (!Array.isArray(items)) {
      return { page: 1, limit: 10, total: 0, totalPages: 1, items: [], startIndex: 0, endIndex: 0 };
    }

    const total = items.length;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 10);
    const totalPages = Math.ceil(total / limitNum) || 1;
    const validPage = Math.min(pageNum, totalPages);

    const startIndex = (validPage - 1) * limitNum;
    const endIndex = Math.min(startIndex + limitNum, total);
    const pageItems = items.slice(startIndex, endIndex);

    return {
      page: validPage,
      limit: limitNum,
      total,
      totalPages,
      items: pageItems,
      startIndex,
      endIndex,
    };
  },
};

export default attendanceService;
