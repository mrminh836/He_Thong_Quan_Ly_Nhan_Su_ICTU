import { api } from './api.js';

/**
 * Service giao tiếp với Backend API quản lý người dùng & trạng thái tài khoản
 */
export const userService = {
  /**
   * Lấy danh sách tất cả tài khoản người dùng
   * Endpoint: GET /api/users
   * @returns {Promise<Array<object>>} Danh sách người dùng
   */
  async getUsers() {
    const res = await api.get('/users');
    return res.data || [];
  },

  /**
   * Cập nhật trạng thái tài khoản người dùng (Active / Locked)
   * Endpoint: PATCH /api/users/:id/status
   * @param {number|string} userId - ID người dùng
   * @param {string} status - 'Active' | 'Locked'
   * @returns {Promise<object>} Dữ liệu tài khoản sau cập nhật
   */
  async updateUserStatus(userId, status) {
    const cleanId = Number(userId);
    const res = await api.patch(`/users/${cleanId}/status`, { status });
    return res.data || res;
  },
};

export default userService;
