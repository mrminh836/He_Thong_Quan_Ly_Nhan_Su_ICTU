import { api } from './api.js';
import { departmentService } from './departmentService.js';

/**
 * FRONTEND SERVICE: DASHBOARD SERVICE
 * Kết nối các API thống kê tổng quan và phân bổ nhân sự cho Dashboard HRM:
 * - GET /api/dashboard/stats: Lấy 3 chỉ số KPI (Tổng nhân sự, Tổng phòng ban, Tỷ lệ có mặt)
 * - GET /api/departments/statistics: Lấy số lượng nhân viên theo từng phòng ban
 */

export const dashboardService = {
  /**
   * Lấy số liệu thống kê tổng quan (3 chỉ số KPI chính) từ Backend
   * @returns {Promise<{ totalEmployees: number, totalDepartments: number, presentEmployees: number, attendanceRate: number, date: string }>}
   */
  async getDashboardStats() {
    const res = await api.get('/dashboard/stats');
    const data = res?.data || {};

    return {
      totalEmployees: Math.max(0, Number(data.totalEmployees) || 0),
      totalDepartments: Math.max(0, Number(data.totalDepartments) || 0),
      presentEmployees: Math.max(0, Number(data.presentEmployees) || 0),
      attendanceRate: typeof data.attendanceRate === 'number'
        ? Number(data.attendanceRate.toFixed(2))
        : Math.max(0, Number(data.attendanceRate) || 0),
      date: data.date || '',
    };
  },

  /**
   * Lấy dữ liệu phân bổ nhân sự theo từng phòng ban phục vụ vẽ biểu đồ
   * Tự động đối soát với totalEmployees để bổ sung nhóm "Chưa phân phòng ban" nếu có
   * 
   * @param {number} [totalWorkingEmployees=null] - Tổng nhân sự đang làm việc từ KPI stats
   * @returns {Promise<{
   *   items: Array<{ id: number|string, name: string, code: string, count: number, percentage: number, color: string }>,
   *   totalCount: number,
   *   departmentCount: number
   * }>}
   */
  async getDepartmentDistribution(totalWorkingEmployees = null) {
    const statsRes = await departmentService.getDepartmentStatistics();
    let rawDepartments = [];
    if (Array.isArray(statsRes?.departments)) {
      rawDepartments = statsRes.departments;
    } else if (Array.isArray(statsRes?.data)) {
      rawDepartments = statsRes.data;
    } else if (Array.isArray(statsRes)) {
      rawDepartments = statsRes;
    }

    // Bảng màu chuẩn SaaS Enterprise hài hòa với hệ thống HRM
    const PALETTE = [
      '#2563eb', // Royal Blue (Tech)
      '#7c3aed', // Purple (HR)
      '#10b981', // Emerald (Business/Sales)
      '#f59e0b', // Amber (Finance)
      '#ec4899', // Pink (Marketing)
      '#06b6d4', // Cyan (Operations)
      '#8b5cf6', // Violet (Legal)
      '#f97316', // Orange (Customer Support)
      '#14b8a6', // Teal (R&D)
      '#6366f1', // Indigo (Management)
    ];

    let assignedCount = 0;
    const items = rawDepartments.map((dept, index) => {
      const count = Math.max(0, Number(dept.employeeCount || dept.activeCount || 0));
      assignedCount += count;
      return {
        id: dept.departmentId || dept.id || index,
        name: dept.departmentName || dept.name || 'Phòng ban',
        code: dept.departmentCode || dept.code || '',
        count,
        percentage: 0, // Sẽ tính sau khi xác định tổng chuẩn
        color: PALETTE[index % PALETTE.length],
        isActive: dept.isActive !== false,
      };
    });

    // Xác định tổng nhân sự chuẩn:
    // Ưu tiên totalWorkingEmployees từ KPI stats của Backend để bảo đảm tính nhất quán 100%
    const total = totalWorkingEmployees !== null && totalWorkingEmployees !== undefined
      ? Math.max(0, Number(totalWorkingEmployees))
      : assignedCount;

    // Nếu tổng nhân sự lớn hơn số đã gán phòng ban -> Bổ sung nhóm "Chưa phân phòng ban"
    if (total > assignedCount) {
      const unassignedCount = total - assignedCount;
      items.push({
        id: 'unassigned',
        name: 'Chưa phân phòng ban',
        code: 'N/A',
        count: unassignedCount,
        percentage: 0,
        color: '#94a3b8', // Slate Gray trung tính
        isUnassigned: true,
      });
    }

    // Tính tỷ trọng phần trăm (%) cho từng phòng ban: Tỷ trọng = (Số NV / Tổng NV) * 100
    const finalTotal = items.reduce((acc, curr) => acc + curr.count, 0);
    items.forEach((item) => {
      item.percentage = finalTotal > 0
        ? Number(((item.count / finalTotal) * 100).toFixed(1))
        : 0;
    });

    return {
      items,
      totalCount: finalTotal,
      departmentCount: rawDepartments.length,
    };
  },
};

export default dashboardService;
