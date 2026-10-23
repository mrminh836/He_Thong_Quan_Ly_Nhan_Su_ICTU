import { query } from '../config/database.js';

/**
 * REPOSITORY: DASHBOARD DATA ACCESS LAYER
 * Xử lý các truy vấn thống kê dữ liệu tổng hợp cho màn hình Dashboard HRM.
 * Áp dụng 100% Prepared Statements / Parameterized Queries chống SQL Injection.
 * Tối ưu hóa hiệu năng, loại bỏ nguy cơ N+1 Query và đếm trùng lặp dữ liệu.
 */

/**
 * Đếm tổng số nhân viên đang làm việc (Active, không tính nhân viên đã thôi việc Resigned)
 * @returns {Promise<number>}
 */
export async function countActiveEmployees() {
  const sql = 'SELECT COUNT(*) AS total FROM `employees` WHERE `employment_status` = ?';
  const rows = await query(sql, ['Active']);
  return Number(rows[0]?.total || 0);
}

/**
 * Đếm tổng số phòng ban đang hoạt động (is_active = 1, loại trừ phòng ban soft-deleted)
 * @returns {Promise<number>}
 */
export async function countActiveDepartments() {
  const sql = 'SELECT COUNT(*) AS total FROM `departments` WHERE `is_active` = ?';
  const rows = await query(sql, [1]);
  return Number(rows[0]?.total || 0);
}

/**
 * Đếm số lượng nhân viên đang làm việc đã check-in trong ngày chỉ định (Asia/Ho_Chi_Minh)
 * Bảo vệ:
 * 1. Khử trùng lặp: COUNT(DISTINCT a.employee_id) đảm bảo 1 nhân viên chỉ tính tối đa 1 lần kể cả khi có nhiều bản ghi bất thường.
 * 2. Loại trừ nhân viên đã thôi việc (Resigned) thông qua JOIN employees WHERE employment_status = 'Active'.
 * 3. Chỉ tính bản ghi có check_in IS NOT NULL.
 * 
 * @param {string} date - Ngày làm việc định dạng YYYY-MM-DD
 * @returns {Promise<number>}
 */
export async function countPresentEmployees(date) {
  const sql = `
    SELECT COUNT(DISTINCT a.employee_id) AS total
    FROM \`attendances\` a
    JOIN \`employees\` e ON a.employee_id = e.employee_id
    WHERE a.attendance_date = ?
      AND a.check_in IS NOT NULL
      AND e.employment_status = ?
  `;
  const rows = await query(sql, [date, 'Active']);
  return Number(rows[0]?.total || 0);
}

/**
 * Lấy toàn bộ số liệu thống kê Dashboard trong duy nhất 1 câu truy vấn tổng hợp (Single Aggregation Query)
 * Tận dụng các chỉ mục có sẵn:
 * - idx_employees_status trên employees(employment_status)
 * - idx_departments_active trên departments(is_active)
 * - idx_attendances_date / uk_attendances_emp_date trên attendances(attendance_date, employee_id)
 * Tránh hoàn toàn N+1 query và không tạo tích Đề-các (Cartesian product).
 * 
 * @param {string} date - Ngày làm việc theo múi giờ Việt Nam (YYYY-MM-DD)
 * @returns {Promise<{ totalEmployees: number, totalDepartments: number, presentEmployees: number }>}
 */
export async function getDashboardStats(date) {
  const sql = `
    SELECT 
      (SELECT COUNT(*) FROM \`employees\` WHERE \`employment_status\` = ?) AS total_employees,
      (SELECT COUNT(*) FROM \`departments\` WHERE \`is_active\` = ?) AS total_departments,
      (SELECT COUNT(DISTINCT a.employee_id) 
       FROM \`attendances\` a 
       JOIN \`employees\` e ON a.employee_id = e.employee_id 
       WHERE a.attendance_date = ? 
         AND a.check_in IS NOT NULL 
         AND e.employment_status = ?) AS present_employees
  `;

  const rows = await query(sql, ['Active', 1, date, 'Active']);
  const row = rows[0] || {};

  return {
    totalEmployees: Number(row.total_employees || 0),
    totalDepartments: Number(row.total_departments || 0),
    presentEmployees: Number(row.present_employees || 0),
  };
}

/**
 * Thống kê tỷ lệ chấm công đúng giờ theo từng phòng ban trong khoảng ngày [startDate, endDate]
 * @param {string} startDate - Ngày bắt đầu YYYY-MM-DD
 * @param {string} endDate - Ngày kết thúc YYYY-MM-DD
 * @returns {Promise<Array<{ departmentId: number, departmentName: string, departmentCode: string, totalEmployees: number, totalCheckIns: number, onTimeCount: number, lateCount: number, onTimeRate: number|null, hasData: boolean }>>}
 */
export async function getDepartmentOnTimeRates(startDate, endDate) {
  const sql = `
    SELECT 
      d.department_id,
      d.department_name,
      d.department_code,
      COUNT(DISTINCT e.employee_id) AS total_employees,
      COUNT(a.attendance_id) AS total_checkins,
      SUM(CASE WHEN a.attendance_status IN ('OnTime', 'EarlyLeave') THEN 1 ELSE 0 END) AS on_time_count,
      SUM(CASE WHEN a.attendance_status = 'Late' THEN 1 ELSE 0 END) AS late_count
    FROM \`departments\` d
    LEFT JOIN \`employees\` e ON d.department_id = e.department_id AND e.employment_status = 'Active'
    LEFT JOIN \`attendances\` a ON e.employee_id = a.employee_id 
      AND a.attendance_date BETWEEN ? AND ? 
      AND a.check_in IS NOT NULL
    WHERE d.is_active = 1
    GROUP BY d.department_id, d.department_name, d.department_code
    ORDER BY d.department_id ASC
  `;

  const rows = await query(sql, [startDate, endDate]);
  return rows.map((row) => {
    const totalCheckIns = Number(row.total_checkins || 0);
    const onTimeCount = Number(row.on_time_count || 0);
    const lateCount = Number(row.late_count || 0);
    const onTimeRate = totalCheckIns > 0
      ? Number(((onTimeCount / totalCheckIns) * 100).toFixed(1))
      : null;

    return {
      departmentId: Number(row.department_id),
      departmentName: row.department_name,
      departmentCode: row.department_code,
      totalEmployees: Number(row.total_employees || 0),
      totalCheckIns,
      onTimeCount,
      lateCount,
      onTimeRate,
      hasData: totalCheckIns > 0,
    };
  });
}

export default {
  countActiveEmployees,
  countActiveDepartments,
  countPresentEmployees,
  getDashboardStats,
  getDepartmentOnTimeRates,
};
