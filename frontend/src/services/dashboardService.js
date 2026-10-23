import { api } from './api.js';
import { departmentService } from './departmentService.js';
import { attendanceService } from './attendanceService.js';

/**
 * FRONTEND SERVICE: DASHBOARD SERVICE
 * Kết nối các API thống kê tổng quan và phân bổ nhân sự cho Dashboard HRM:
 * - GET /api/dashboard/stats: Lấy 3 chỉ số KPI (Tổng nhân sự, Tổng phòng ban, Tỷ lệ có mặt)
 * - GET /api/departments/statistics: Lấy số lượng nhân viên theo từng phòng ban
 * - GET /api/attendance/today: Lấy dữ liệu chấm công thực tế của toàn công ty
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
   * Lấy dữ liệu phân bổ nhân sự theo từng phòng ban phục vụ vẽ biểu đồ tròn (Pie/Doughnut Chart)
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
        percentage: typeof dept.percentage === 'number' ? dept.percentage : 0,
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

  /**
   * Lấy số liệu tỷ lệ chấm công đúng giờ theo từng phòng ban phục vụ Bar Chart
   * Nguồn dữ liệu thực tế từ:
   * - GET /api/departments/statistics: danh sách phòng ban
   * - GET /api/attendance/today: nhật ký check-in thực tế hôm nay của nhân viên
   * 
   * @param {string} [timeFilter='today'] 'today' | '7days' | 'month'
   * @returns {Promise<{
   *   isSupported: boolean,
   *   filter: string,
   *   items: Array<{
   *     departmentId: number|string,
   *     departmentName: string,
   *     departmentCode: string,
   *     totalEmployees: number,
   *     totalCheckIns: number,
   *     onTimeCount: number,
   *     lateCount: number,
   *     onTimeRate: number|null,
   *     hasData: boolean
   *   }>,
   *   totalCheckIns: number,
   *   totalOnTime: number,
   *   averageRate: number,
   *   message?: string
   * }>}
   */
  async getDepartmentOnTimeRates(timeFilter = 'today') {
    // 1. Gọi API Backend thống kê tỷ lệ đúng giờ theo phòng ban cho các mốc thời gian ('today' | '7days' | 'month')
    try {
      const res = await api.get(`/dashboard/department-ontime?range=${encodeURIComponent(timeFilter)}`);
      const payload = res?.data || res;
      if (payload && Array.isArray(payload.items)) {
        return {
          isSupported: true,
          filter: payload.filter || timeFilter,
          items: payload.items,
          totalCheckIns: Number(payload.totalCheckIns) || 0,
          totalOnTime: Number(payload.totalOnTime) || 0,
          averageRate: Number(payload.averageRate) || 0,
        };
      }
    } catch (err) {
      console.warn('[DashboardService] Gọi /dashboard/department-ontime không thành công, thử fallback:', err?.message);
    }

    // 2. Nếu khoảng thời gian không phải 'today' và backend lỗi, trả về thông báo lỗi
    if (timeFilter !== 'today') {
      return {
        isSupported: false,
        filter: timeFilter,
        items: [],
        totalCheckIns: 0,
        totalOnTime: 0,
        averageRate: 0,
        message: 'Không thể kết nối máy chủ để lấy dữ liệu thống kê cho khoảng thời gian này. Vui lòng thử lại sau.',
      };
    }

    // 3. Fallback tính toán nội bộ cho 'today' nếu API tổng hợp tạm thời không khả dụng:
    // Lấy danh sách phòng ban thực tế từ GET /api/departments/statistics
    const deptStatsRes = await departmentService.getDepartmentStatistics();
    let departments = [];
    if (Array.isArray(deptStatsRes?.departments)) {
      departments = deptStatsRes.departments;
    } else if (Array.isArray(deptStatsRes?.data)) {
      departments = deptStatsRes.data;
    } else if (Array.isArray(deptStatsRes)) {
      departments = deptStatsRes;
    }

    // 2. Lấy dữ liệu chấm công hôm nay của toàn công ty từ GET /api/attendance/today
    const attRes = await attendanceService.getTodayAttendance();
    let records = [];
    if (Array.isArray(attRes?.data)) {
      records = attRes.data;
    } else if (attRes?.data && typeof attRes.data === 'object') {
      records = [attRes.data];
    }

    // 3. Tổng hợp theo từng phòng ban
    let sumCheckIns = 0;
    let sumOnTime = 0;

    const items = departments.map((dept, idx) => {
      const deptId = dept.departmentId || dept.id || idx;
      const deptName = dept.departmentName || dept.name || 'Phòng ban';
      const deptCode = dept.departmentCode || dept.code || '';
      const totalEmployees = Math.max(0, Number(dept.employeeCount || dept.count || 0));

      // Lọc các bản ghi chấm công thuộc phòng ban này
      const deptRecords = records.filter((r) => {
        if (r.departmentId && deptId) {
          return Number(r.departmentId) === Number(deptId);
        }
        if (r.departmentName && deptName) {
          return r.departmentName.trim().toLowerCase() === deptName.trim().toLowerCase();
        }
        return false;
      });

      // Bản ghi check-in hợp lệ (có checkInTime)
      const validCheckIns = deptRecords.filter((r) => Boolean(r.checkInTime));
      const totalCheckIns = validCheckIns.length;
      const onTimeCount = validCheckIns.filter((r) => r.status === 'ON_TIME').length;
      const lateCount = validCheckIns.filter((r) => r.status === 'LATE').length;

      sumCheckIns += totalCheckIns;
      sumOnTime += onTimeCount;

      // Tỷ lệ đúng giờ: Nếu có ít nhất 1 lượt check-in -> tính %, nếu 0 lượt check-in -> null (chưa có dữ liệu)
      const onTimeRate = totalCheckIns > 0
        ? Number(((onTimeCount / totalCheckIns) * 100).toFixed(1))
        : null;

      return {
        departmentId: deptId,
        departmentName: deptName,
        departmentCode: deptCode,
        totalEmployees,
        totalCheckIns,
        onTimeCount,
        lateCount,
        onTimeRate,
        hasData: totalCheckIns > 0,
      };
    });

    const averageRate = sumCheckIns > 0
      ? Number(((sumOnTime / sumCheckIns) * 100).toFixed(1))
      : 0;

    return {
      isSupported: true,
      filter: 'today',
      items,
      totalCheckIns: sumCheckIns,
      totalOnTime: sumOnTime,
      averageRate,
    };
  },
};

export default dashboardService;
