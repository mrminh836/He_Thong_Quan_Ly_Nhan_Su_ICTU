import { api } from './api.js';

/**
 * Service tầng giao tiếp API Quản lý Phòng ban (Department Service)
 * Kết nối các endpoint chuẩn của Backend HRM ICTU:
 * - GET    /api/departments            : Danh sách phòng ban (phân trang, tìm kiếm)
 * - GET    /api/departments/statistics : Thống kê số lượng nhân viên theo phòng ban
 * - GET    /api/departments/:id        : Chi tiết phòng ban
 * - POST   /api/departments            : Tạo phòng ban mới
 * - PUT    /api/departments/:id        : Cập nhật phòng ban
 * - DELETE /api/departments/:id        : Xóa phòng ban (ràng buộc toàn vẹn dữ liệu)
 */

export const departmentService = {
  /**
   * Lấy danh sách phòng ban từ Backend (có hỗ trợ phân trang và tìm kiếm)
   * @param {object} options
   * @param {number} [options.page=1]
   * @param {number} [options.limit=10]
   * @param {string} [options.search='']
   * @param {string} [options.status='all'] 'all' | 'active' | 'inactive'
   * @returns {Promise<{ items: Array, meta: object }>}
   */
  async getDepartments({ page = 1, limit = 10, search = '', status = 'all' } = {}) {
    const params = new URLSearchParams();
    if (page) params.append('page', String(page));
    if (limit) params.append('limit', String(limit));
    if (search && search.trim()) params.append('search', search.trim());
    if (status && status !== 'all') params.append('status', status);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const res = await api.get(`/departments${queryStr}`);

    return {
      items: res.data || [],
      meta: res.meta || {
        page: Number(page),
        limit: Number(limit),
        total: Array.isArray(res.data) ? res.data.length : 0,
        totalPages: 1,
      },
      message: res.message,
    };
  },

  /**
   * Lấy số liệu thống kê nhân viên theo từng phòng ban và tổng hợp toàn công ty
   * @param {object} options
   * @returns {Promise<{ departments: Array, summary: object }>}
   */
  async getDepartmentStatistics(options = {}) {
    const res = await api.get('/departments/statistics');
    return {
      departments: res.data || [],
      summary: res.meta || {
        totalDepartments: 0,
        emptyDepartments: 0,
        totalEmployees: 0,
        activeEmployees: 0,
        onLeaveEmployees: 0,
      },
    };
  },

  /**
   * Lấy thông tin chi tiết một phòng ban cụ thể bằng ID
   * @param {number|string} id
   * @returns {Promise<object>}
   */
  async getDepartmentById(id) {
    if (!id) throw new Error('ID phòng ban là bắt buộc.');
    const res = await api.get(`/departments/${id}`);
    return res.data;
  },

  /**
   * Tạo mới phòng ban
   * @param {object} departmentData
   * @param {string} departmentData.departmentName - Tên phòng ban (Bắt buộc)
   * @param {string} [departmentData.departmentCode] - Mã phòng ban (Tự sinh nếu không truyền)
   * @param {string} [departmentData.location] - Địa điểm / Tầng
   * @param {string} [departmentData.phone] - Số điện thoại bàn
   * @param {string} [departmentData.description] - Mô tả chức năng
   * @param {boolean} [departmentData.isActive=true] - Trạng thái hoạt động
   * @returns {Promise<object>}
   */
  async createDepartment(departmentData) {
    if (!departmentData?.departmentName || !departmentData.departmentName.trim()) {
      throw new Error('Tên phòng ban không được để trống.');
    }

    const payload = {
      departmentName: departmentData.departmentName.trim(),
      ...(departmentData.departmentCode && { departmentCode: departmentData.departmentCode.trim().toUpperCase() }),
      location: departmentData.location ? departmentData.location.trim() : null,
      phone: departmentData.phone ? departmentData.phone.trim() : null,
      description: departmentData.description ? departmentData.description.trim() : null,
      isActive: departmentData.isActive !== undefined ? Boolean(departmentData.isActive) : true,
    };

    const res = await api.post('/departments', payload);
    return res.data;
  },

  /**
   * Cập nhật thông tin phòng ban
   * @param {number|string} id
   * @param {object} updates
   * @returns {Promise<object>}
   */
  async updateDepartment(id, updates) {
    if (!id) throw new Error('ID phòng ban là bắt buộc để cập nhật.');

    const payload = {};
    if (updates.departmentName !== undefined) {
      if (!updates.departmentName.trim()) {
        throw new Error('Tên phòng ban không được để trống.');
      }
      payload.departmentName = updates.departmentName.trim();
    }
    if (updates.departmentCode !== undefined) {
      payload.departmentCode = updates.departmentCode.trim().toUpperCase();
    }
    if (updates.location !== undefined) {
      payload.location = updates.location ? updates.location.trim() : null;
    }
    if (updates.phone !== undefined) {
      payload.phone = updates.phone ? updates.phone.trim() : null;
    }
    if (updates.description !== undefined) {
      payload.description = updates.description ? updates.description.trim() : null;
    }
    if (updates.isActive !== undefined) {
      payload.isActive = Boolean(updates.isActive);
    }

    const res = await api.put(`/departments/${id}`, payload);
    return res.data;
  },

  /**
   * Xóa phòng ban (Backend có ràng buộc toàn vẹn kiểm tra nhân viên trực thuộc)
   * @param {number|string} id
   * @returns {Promise<object>}
   */
  async deleteDepartment(id) {
    if (!id) throw new Error('ID phòng ban là bắt buộc để xóa.');
    const res = await api.delete(`/departments/${id}`);
    return res;
  },
};

export default departmentService;
