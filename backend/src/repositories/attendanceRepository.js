import { query } from '../config/database.js';

/**
 * Repository thao tác bảng CSDL `attendances`
 * Áp dụng 100% Prepared Statements (Parameterized Queries) chống SQL Injection.
 */

/**
 * Tìm kiếm bản ghi chấm công của nhân viên theo ngày làm việc
 * @param {number} employeeId - ID nhân viên
 * @param {string} workDate - Ngày làm việc định dạng YYYY-MM-DD
 * @returns {Promise<object|null>}
 */
export async function findByEmployeeAndDate(employeeId, workDate) {
  if (!employeeId || !workDate) return null;

  const sql = `
    SELECT 
      a.attendance_id,
      a.employee_id,
      a.attendance_date,
      a.check_in,
      a.check_out,
      a.attendance_status,
      a.note,
      a.created_at,
      a.updated_at
    FROM \`attendances\` a
    WHERE a.employee_id = ? AND a.attendance_date = ?
    LIMIT 1
  `;

  const rows = await query(sql, [employeeId, workDate]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Tạo mới bản ghi check-in cho nhân viên
 * Ràng buộc UNIQUE(employee_id, attendance_date) ngăn chặn check-in 2 lần trong 1 ngày làm việc
 * 
 * @param {object} params
 * @param {number} params.employeeId - ID nhân viên
 * @param {string} params.workDate - Ngày làm việc (YYYY-MM-DD)
 * @param {string} params.checkInTime - Giờ vào ca (HH:mm:ss)
 * @param {string} params.status - Trạng thái: 'OnTime' hoặc 'Late'
 * @param {string} [params.note] - Ghi chú
 * @returns {Promise<number>} ID bản ghi vừa tạo
 */
export async function createCheckIn({ employeeId, workDate, checkInTime, status, note = null }) {
  const sql = `
    INSERT INTO \`attendances\` (
      \`employee_id\`,
      \`attendance_date\`,
      \`check_in\`,
      \`attendance_status\`,
      \`note\`
    ) VALUES (?, ?, ?, ?, ?)
  `;

  const params = [
    employeeId,
    workDate,
    checkInTime,
    status,
    note,
  ];

  try {
    const result = await query(sql, params);
    return result.insertId;
  } catch (error) {
    // Bắt mã lỗi MySQL ER_DUP_ENTRY (1062) khi vi phạm unique constraint uk_attendances_emp_date
    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
      const dupError = new Error('Nhân viên đã thực hiện check-in trong ngày làm việc này.');
      dupError.code = 'ER_DUP_ENTRY';
      dupError.isDuplicate = true;
      throw dupError;
    }
    throw error;
  }
}

/**
 * Cập nhật giờ check-out cho nhân viên trong ngày làm việc
 * Sử dụng câu lệnh UPDATE có điều kiện (check_out IS NULL) để đảm bảo tính nguyên tử,
 * ngăn chặn race condition khi hai request check-out đến cùng lúc.
 * 
 * @param {object} params
 * @param {number} params.employeeId - ID nhân viên
 * @param {string} params.workDate - Ngày làm việc (YYYY-MM-DD)
 * @param {string} params.checkOutTime - Giờ tan ca (HH:mm:ss)
 * @returns {Promise<number>} Số dòng bị ảnh hưởng (1 nếu thành công, 0 nếu đã check-out hoặc không tìm thấy)
 */
export async function updateCheckOut({ employeeId, workDate, checkOutTime }) {
  const sql = `
    UPDATE \`attendances\`
    SET 
      \`check_out\` = ?,
      \`updated_at\` = CURRENT_TIMESTAMP
    WHERE \`employee_id\` = ? 
      AND \`attendance_date\` = ? 
      AND \`check_out\` IS NULL
  `;

  const result = await query(sql, [checkOutTime, employeeId, workDate]);
  return result.affectedRows;
}

/**
 * Lấy danh sách bảng chấm công hôm nay cho Quản trị viên (ADMIN / HR_MANAGER)
 * Sử dụng LEFT JOIN từ employees sang attendances để nhân viên chưa check-in vẫn hiển thị.
 * Bảo mật: Tuyệt đối không SELECT ssn_encrypted, ssn_hash hoặc bất kỳ dữ liệu nhạy cảm nào.
 * 
 * @param {string} workDate - Ngày làm việc định dạng YYYY-MM-DD
 * @returns {Promise<Array<object>>} Danh sách chấm công hôm nay của toàn bộ nhân viên hoạt động
 */
export async function getTodayAttendanceBoard(workDate) {
  const sql = `
    SELECT 
      a.attendance_id,
      e.employee_id,
      e.employee_code,
      e.full_name,
      e.department_id,
      d.department_name,
      ? AS work_date,
      a.check_in,
      a.check_out,
      a.attendance_status
    FROM \`employees\` e
    LEFT JOIN \`departments\` d ON e.department_id = d.department_id
    LEFT JOIN \`attendances\` a ON e.employee_id = a.employee_id AND a.attendance_date = ?
    WHERE e.employment_status = 'Active'
    ORDER BY d.department_name ASC, e.employee_code ASC
  `;

  const rows = await query(sql, [workDate, workDate]);
  return rows;
}

/**
 * Tìm bản ghi chấm công theo ID
 * @param {number} attendanceId
 * @returns {Promise<object|null>}
 */
export async function findById(attendanceId) {
  if (!attendanceId) return null;

  const sql = `
    SELECT 
      a.attendance_id,
      a.employee_id,
      a.attendance_date,
      a.check_in,
      a.check_out,
      a.attendance_status,
      a.note,
      a.created_at,
      a.updated_at
    FROM \`attendances\` a
    WHERE a.attendance_id = ?
    LIMIT 1
  `;

  const rows = await query(sql, [attendanceId]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Xóa bản ghi chấm công theo ID (dành cho dọn dẹp môi trường test)
 * @param {number} attendanceId
 * @returns {Promise<boolean>}
 */
export async function deleteById(attendanceId) {
  if (!attendanceId) return false;
  const sql = 'DELETE FROM `attendances` WHERE `attendance_id` = ?';
  const result = await query(sql, [attendanceId]);
  return result.affectedRows > 0;
}

export default {
  findByEmployeeAndDate,
  createCheckIn,
  updateCheckOut,
  getTodayAttendanceBoard,
  findById,
  deleteById,
};
