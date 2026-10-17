import { api } from './api.js';

/**
 * Service tầng giao tiếp API Quản lý Nhân sự (Employee Service)
 * Kết nối các endpoint chuẩn của Backend HRM ICTU:
 * - GET  /api/employees               : Lấy danh sách nhân viên (phân trang, lọc phòng ban, tìm kiếm mã NV/họ tên)
 * - GET  /api/employees/:id           : Lấy chi tiết nhân viên và giải mã CCCD (AES_DECRYPT) cho Admin/HR
 * - POST /api/employees               : Thêm nhân viên mới (mã hóa CCCD bằng AES_ENCRYPT)
 * - GET  /api/departments/statistics  : Thống kê số lượng nhân viên toàn công ty và theo phòng ban
 */

export const employeeService = {
  /**
   * Lấy danh sách nhân viên từ Backend có hỗ trợ phân trang, lọc phòng ban và tìm kiếm
   * @param {object} options
   * @param {number} [options.page=1] - Trang hiện tại
   * @param {number} [options.limit=10] - Số bản ghi mỗi trang (10, 20, 50)
   * @param {number|string|null} [options.departmentId=null] - ID phòng ban cần lọc
   * @param {string} [options.search=''] - Từ khóa tìm kiếm theo mã nhân viên hoặc họ tên
   * @returns {Promise<{ items: Array, pagination: { page: number, limit: number, total: number, totalPages: number }, message: string }>}
   */
  async getEmployees({ page = 1, limit = 10, departmentId = null, search = '' } = {}) {
    const params = new URLSearchParams();

    if (page) {
      params.append('page', String(page));
    }
    if (limit) {
      params.append('limit', String(limit));
    }
    if (departmentId !== null && departmentId !== undefined && departmentId !== '' && departmentId !== 'all') {
      params.append('departmentId', String(departmentId));
    }
    if (search && typeof search === 'string' && search.trim()) {
      params.append('search', search.trim());
    }

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const res = await api.get(`/employees${queryStr}`);

    const pagination = res.pagination || res.meta || {
      page: Number(page),
      limit: Number(limit),
      total: Array.isArray(res.data) ? res.data.length : 0,
      totalPages: 1,
    };

    return {
      items: res.data || [],
      pagination: {
        page: Number(pagination.page || page),
        limit: Number(pagination.limit || limit),
        total: Number(pagination.total || 0),
        totalPages: Number(pagination.totalPages || 0),
      },
      message: res.message || 'Lấy danh sách nhân viên thành công',
    };
  },

  /**
   * Lấy thông tin chi tiết của một nhân viên bằng ID (Bao gồm CCCD đã giải mã nếu là Admin/HR)
   * @param {number|string} id - ID nhân viên (số nguyên dương)
   * @returns {Promise<object>} Dữ liệu chi tiết nhân viên
   */
  async getEmployeeById(id) {
    if (!id || isNaN(Number(id))) {
      throw new Error('Mã định danh nhân viên (ID) không hợp lệ.');
    }

    const res = await api.get(`/employees/${id}`);
    return res.data || res;
  },

  /**
   * Tạo mới nhân sự vào hệ thống HRM
   * @param {object} employeeData
   * @returns {Promise<object>}
   */
  async createEmployee(employeeData) {
    if (!employeeData || typeof employeeData !== 'object') {
      throw new Error('Dữ liệu nhân viên không hợp lệ.');
    }

    const res = await api.post('/employees', employeeData);
    return res.data || res;
  },

  /**
   * Cập nhật thông tin nhân sự (Chức vụ, Mức lương, Số điện thoại)
   * Kết nối endpoint: PUT /api/employees/:id
   * @param {number|string} id - ID nhân viên
   * @param {object} updates - Dữ liệu cập nhật
   * @returns {Promise<object>}
   */
  async updateEmployee(id, updates) {
    if (!id || isNaN(Number(id))) {
      throw new Error('Mã định danh nhân viên (ID) không hợp lệ.');
    }
    if (!updates || typeof updates !== 'object') {
      throw new Error('Dữ liệu cập nhật không hợp lệ.');
    }

    const res = await api.put(`/employees/${id}`, updates);
    return res.data || res;
  },

  /**
   * Chuyển nhân viên sang trạng thái thôi việc (Resigned) và khóa tài khoản User liên kết
   * Kết nối endpoint: PATCH /api/employees/:id
   * @param {number|string} id - ID nhân viên
   * @returns {Promise<object>} Dữ liệu sau khi cập nhật trạng thái thôi việc
   */
  async resignEmployee(id) {
    if (!id || isNaN(Number(id))) {
      throw new Error('Mã định danh nhân viên (ID) không hợp lệ.');
    }

    const res = await api.patch(`/employees/${id}`, { action: 'RESIGN' });
    return res.data || res;
  },

  /**
   * Lấy số liệu thống kê nhân viên toàn diện từ Backend
   * @returns {Promise<{ totalEmployees: number, activeEmployees: number, deptsWithEmployees: number }>}
   */
  async getEmployeeSummaryStats() {
    try {
      const res = await api.get('/departments/statistics');
      const meta = res.meta || {};
      const depts = res.data || [];

      // Tính số phòng ban có ít nhất 1 nhân viên
      const deptsWithEmployees = depts.filter((d) => Number(d.employeeCount || 0) > 0).length;

      return {
        totalEmployees: Number(meta.totalEmployees ?? depts.reduce((sum, d) => sum + Number(d.employeeCount || 0), 0)),
        activeEmployees: Number(meta.activeEmployees ?? depts.reduce((sum, d) => sum + Number(d.activeCount || 0), 0)),
        deptsWithEmployees: Number(deptsWithEmployees),
      };
    } catch (error) {
      console.warn('[EmployeeService] Không thể lấy thống kê từ /departments/statistics:', error.message);
      return {
        totalEmployees: 0,
        activeEmployees: 0,
        deptsWithEmployees: 0,
      };
    }
  },
};

export default employeeService;
