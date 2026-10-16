import { query } from '../config/database.js';

/**
 * Tìm kiếm tài khoản người dùng theo Username hoặc Email nhân viên
 * Sử dụng parameterized query 100% để chống SQL Injection
 * 
 * @param {string} identifier - Tên đăng nhập (username) hoặc Email
 * @returns {Promise<object|null>} Bản ghi người dùng kèm thông tin nhân sự cơ bản
 */
export async function findByUsernameOrEmail(identifier) {
  if (!identifier || typeof identifier !== 'string') {
    return null;
  }

  const sql = `
    SELECT 
      u.user_id,
      u.employee_id,
      u.username,
      u.password_hash,
      u.role,
      u.account_status,
      u.last_login_at,
      u.created_at,
      u.updated_at,
      e.employee_code,
      e.full_name,
      e.email,
      e.phone,
      e.position,
      e.department_id,
      d.department_name,
      e.hire_date,
      e.employment_status
    FROM ` + '`users`' + ` u
    LEFT JOIN ` + '`employees`' + ` e ON u.employee_id = e.employee_id
    LEFT JOIN ` + '`departments`' + ` d ON e.department_id = d.department_id
    WHERE u.username = ? OR e.email = ?
    LIMIT 1
  `;

  const rows = await query(sql, [identifier.trim(), identifier.trim()]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Tìm kiếm tài khoản theo ID
 * @param {number} userId - Khóa chính user_id
 * @returns {Promise<object|null>}
 */
export async function findById(userId) {
  if (!userId) {
    return null;
  }

  const sql = `
    SELECT 
      u.user_id,
      u.employee_id,
      u.username,
      u.role,
      u.account_status,
      u.last_login_at,
      u.created_at,
      u.updated_at,
      e.employee_code,
      e.full_name,
      e.email,
      e.phone,
      e.position,
      e.department_id,
      d.department_name,
      e.hire_date,
      e.employment_status
    FROM ` + '`users`' + ` u
    LEFT JOIN ` + '`employees`' + ` e ON u.employee_id = e.employee_id
    LEFT JOIN ` + '`departments`' + ` d ON e.department_id = d.department_id
    WHERE u.user_id = ?
    LIMIT 1
  `;

  const rows = await query(sql, [userId]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Cập nhật thời điểm đăng nhập thành công gần nhất
 * @param {number} userId 
 * @returns {Promise<boolean>}
 */
export async function updateLastLogin(userId) {
  if (!userId) {
    return false;
  }

  const sql = `
    UPDATE ` + '`users`' + `
    SET last_login_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `;

  const result = await query(sql, [userId]);
  return result.affectedRows > 0;
}

/**
 * Khởi tạo người dùng mới với mật khẩu đã băm sẵn
 * @param {object} param0
 * @param {number|null} param0.employeeId
 * @param {string} param0.username
 * @param {string} param0.passwordHash
 * @param {string} [param0.role='Employee']
 * @param {string} [param0.accountStatus='Active']
 * @returns {Promise<number>} ID của bản ghi vừa tạo
 */
export async function createUser({
  employeeId = null,
  username,
  passwordHash,
  role = 'Employee',
  accountStatus = 'Active',
}) {
  const sql = `
    INSERT INTO ` + '`users`' + ` (employee_id, username, password_hash, role, account_status)
    VALUES (?, ?, ?, ?, ?)
  `;

  const result = await query(sql, [
    employeeId,
    username.trim(),
    passwordHash,
    role,
    accountStatus,
  ]);

  return result.insertId;
}

/**
 * Tìm kiếm tài khoản User theo Employee ID
 * @param {number} employeeId
 * @returns {Promise<object|null>}
 */
export async function findByEmployeeId(employeeId) {
  if (!employeeId) {
    return null;
  }

  const sql = `
    SELECT 
      u.user_id,
      u.employee_id,
      u.username,
      u.role,
      u.account_status,
      u.last_login_at,
      u.created_at,
      u.updated_at
    FROM \`users\` u
    WHERE u.employee_id = ?
    LIMIT 1
  `;

  const rows = await query(sql, [employeeId]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Cập nhật trạng thái tài khoản người dùng
 * @param {number} userId
 * @param {string} status - 'Active' | 'Locked' | 'Inactive'
 * @returns {Promise<boolean>}
 */
export async function updateAccountStatus(userId, status) {
  if (!userId || !status) {
    return false;
  }

  const sql = `
    UPDATE \`users\`
    SET account_status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `;

  const result = await query(sql, [status, userId]);
  return result.affectedRows > 0;
}

export default {
  findByUsernameOrEmail,
  findById,
  findByEmployeeId,
  updateLastLogin,
  updateAccountStatus,
  createUser,
};
