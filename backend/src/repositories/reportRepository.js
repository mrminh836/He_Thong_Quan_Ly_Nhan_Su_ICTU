import { query } from '../config/database.js';

/**
 * REPOSITORY: REPORT DATA ACCESS LAYER
 * Xử lý các truy vấn tổng hợp dữ liệu phục vụ xuất báo cáo HRM (Excel / CSV)
 * Đảm bảo:
 * 1. Sử dụng 100% Prepared Statements / Parameterized Queries chống SQL Injection.
 * 2. Tránh JOIN gây nhân bản bản ghi chấm công.
 * 3. Bảo mật: Tuyệt đối không SELECT ssn_encrypted, ssn_hash, mật khẩu hoặc dữ liệu nhạy cảm.
 * 4. Sắp xếp dữ liệu ổn định: Ngày giảm dần, Tên phòng ban tăng dần, Mã NV tăng dần.
 */

/**
 * Truy vấn danh sách chi tiết các bản ghi chấm công phục vụ xuất báo cáo
 * 
 * @param {object} params
 * @param {string} params.startDate - Ngày bắt đầu (YYYY-MM-DD, bao gồm)
 * @param {string} params.endDate - Ngày kết thúc (YYYY-MM-DD, không bao gồm nếu theo chuẩn nửa khoảng, hoặc bao gồm)
 * @param {boolean} [params.inclusiveEndDate=false] - Nếu true: dùng a.attendance_date <= endDate; false: < endDate
 * @param {number|null} [params.departmentId=null] - Lọc theo phòng ban
 * @param {number|null} [params.employeeId=null] - Lọc theo nhân viên
 * @returns {Promise<Array<object>>}
 */
export async function getAttendanceReportData({
  startDate,
  endDate,
  inclusiveEndDate = false,
  departmentId = null,
  employeeId = null,
}) {
  const whereClauses = [];
  const params = [];

  // 1. Khoảng thời gian
  if (inclusiveEndDate) {
    whereClauses.push('a.attendance_date >= ? AND a.attendance_date <= ?');
    params.push(startDate, endDate);
  } else {
    whereClauses.push('a.attendance_date >= ? AND a.attendance_date < ?');
    params.push(startDate, endDate);
  }

  // 2. Bộ lọc phòng ban
  if (departmentId !== null && departmentId !== undefined && !Number.isNaN(Number(departmentId))) {
    whereClauses.push('e.department_id = ?');
    params.push(Number(departmentId));
  }

  // 3. Bộ lọc nhân viên
  if (employeeId !== null && employeeId !== undefined && !Number.isNaN(Number(employeeId))) {
    whereClauses.push('a.employee_id = ?');
    params.push(Number(employeeId));
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = `
    SELECT 
      a.attendance_id,
      a.employee_id,
      e.employee_code,
      e.full_name AS employee_name,
      e.position,
      e.department_id,
      COALESCE(d.department_name, 'Chưa phân phòng ban') AS department_name,
      d.department_code,
      DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
      a.check_in,
      a.check_out,
      a.attendance_status,
      a.note
    FROM \`attendances\` a
    JOIN \`employees\` e ON a.employee_id = e.employee_id
    LEFT JOIN \`departments\` d ON e.department_id = d.department_id
    ${whereSql}
    ORDER BY a.attendance_date DESC, d.department_name ASC, e.employee_code ASC, a.attendance_id DESC
  `;

  const rows = await query(sql, params);
  return rows;
}

/**
 * Truy vấn các chỉ số thống kê tổng hợp (Summary) cho tập dữ liệu báo cáo
 * 
 * @param {object} params
 * @param {string} params.startDate
 * @param {string} params.endDate
 * @param {boolean} [params.inclusiveEndDate=false]
 * @param {number|null} [params.departmentId=null]
 * @param {number|null} [params.employeeId=null]
 * @returns {Promise<{
 *   totalRecords: number,
 *   totalWorkDays: number,
 *   onTimeCount: number,
 *   lateCount: number,
 *   earlyLeaveCount: number
 * }>}
 */
export async function getAttendanceReportSummary({
  startDate,
  endDate,
  inclusiveEndDate = false,
  departmentId = null,
  employeeId = null,
}) {
  const whereClauses = [];
  const params = [];

  if (inclusiveEndDate) {
    whereClauses.push('a.attendance_date >= ? AND a.attendance_date <= ?');
    params.push(startDate, endDate);
  } else {
    whereClauses.push('a.attendance_date >= ? AND a.attendance_date < ?');
    params.push(startDate, endDate);
  }

  if (departmentId !== null && departmentId !== undefined && !Number.isNaN(Number(departmentId))) {
    whereClauses.push('e.department_id = ?');
    params.push(Number(departmentId));
  }

  if (employeeId !== null && employeeId !== undefined && !Number.isNaN(Number(employeeId))) {
    whereClauses.push('a.employee_id = ?');
    params.push(Number(employeeId));
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = `
    SELECT 
      COUNT(a.attendance_id) AS total_records,
      COUNT(DISTINCT CASE 
        WHEN (a.check_in IS NOT NULL OR a.check_out IS NOT NULL) 
             AND UPPER(a.attendance_status) != 'ABSENT' 
        THEN CONCAT(a.employee_id, '_', a.attendance_date) 
      END) AS total_work_days,
      COUNT(DISTINCT CASE 
        WHEN a.check_in IS NOT NULL 
             AND a.check_in <= '08:30:00' 
             AND UPPER(a.attendance_status) NOT IN ('LATE', 'ABSENT') 
        THEN CONCAT(a.employee_id, '_', a.attendance_date) 
      END) AS on_time_count,
      COUNT(DISTINCT CASE 
        WHEN UPPER(a.attendance_status) = 'LATE' 
             OR (a.check_in IS NOT NULL AND a.check_in > '08:30:00') 
        THEN CONCAT(a.employee_id, '_', a.attendance_date) 
      END) AS late_count,
      COUNT(DISTINCT CASE 
        WHEN UPPER(a.attendance_status) IN ('EARLYLEAVE', 'EARLY_LEAVE') 
             OR (a.check_out IS NOT NULL AND a.check_out < '17:30:00') 
        THEN CONCAT(a.employee_id, '_', a.attendance_date) 
      END) AS early_leave_count
    FROM \`attendances\` a
    JOIN \`employees\` e ON a.employee_id = e.employee_id
    LEFT JOIN \`departments\` d ON e.department_id = d.department_id
    ${whereSql}
  `;

  const rows = await query(sql, params);
  const row = rows[0] || {};

  return {
    totalRecords: Number.parseInt(row.total_records, 10) || 0,
    totalWorkDays: Number.parseInt(row.total_work_days, 10) || 0,
    onTimeCount: Number.parseInt(row.on_time_count, 10) || 0,
    lateCount: Number.parseInt(row.late_count, 10) || 0,
    earlyLeaveCount: Number.parseInt(row.early_leave_count, 10) || 0,
  };
}

export default {
  getAttendanceReportData,
  getAttendanceReportSummary,
};
