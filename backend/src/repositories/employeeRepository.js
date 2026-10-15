import { query } from '../config/database.js';

/**
 * REPOSITORY: EMPLOYEE DATA ACCESS LAYER
 * Xử lý truy vấn cơ sở dữ liệu cho module Nhân sự (Employees).
 * Áp dụng 100% Prepared Statements / Parameterized Queries chống SQL Injection.
 * Bảo mật: Tuyệt đối không trả chuỗi nhị phân ssn_encrypted hoặc ssn_hash ra ngoài repository.
 */

/**
 * Tìm kiếm nhân viên theo Mã nhân viên (employee_code)
 * @param {string} employeeCode
 * @returns {Promise<object|null>}
 */
export async function findByCode(employeeCode) {
  if (!employeeCode || typeof employeeCode !== 'string') return null;

  const sql = `
    SELECT 
      e.employee_id,
      e.employee_code,
      e.full_name,
      e.email,
      e.phone,
      e.address,
      e.gender,
      e.date_of_birth,
      e.ssn_masked,
      e.department_id,
      e.position,
      e.base_salary,
      e.hire_date,
      e.employment_status,
      e.created_at,
      e.updated_at
    FROM \`employees\` e
    WHERE e.employee_code = ?
    LIMIT 1
  `;

  const rows = await query(sql, [employeeCode.trim().toUpperCase()]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Tìm kiếm nhân viên theo mã băm bảo mật HMAC của số CCCD/CMND (ssn_hash)
 * Phục vụ kiểm tra trùng lặp an toàn mà không cần giải mã CSDL
 * 
 * @param {string} ssnHash - Chuỗi hash HMAC-SHA-256 (64 ký tự hex)
 * @returns {Promise<object|null>}
 */
export async function findBySsnHash(ssnHash) {
  if (!ssnHash || typeof ssnHash !== 'string') return null;

  const sql = `
    SELECT 
      e.employee_id,
      e.employee_code,
      e.full_name,
      e.ssn_masked,
      e.department_id,
      e.employment_status
    FROM \`employees\` e
    WHERE e.ssn_hash = ?
    LIMIT 1
  `;

  const rows = await query(sql, [ssnHash.trim().toLowerCase()]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Tìm kiếm nhân viên theo Email
 * @param {string} email
 * @returns {Promise<object|null>}
 */
export async function findByEmail(email) {
  if (!email || typeof email !== 'string') return null;

  const sql = `
    SELECT 
      e.employee_id,
      e.employee_code,
      e.full_name,
      e.email,
      e.department_id
    FROM \`employees\` e
    WHERE e.email = ?
    LIMIT 1
  `;

  const rows = await query(sql, [email.trim().toLowerCase()]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Tìm kiếm nhân viên theo ID kèm thông tin liên kết phòng ban và tài khoản
 * @param {number} employeeId
 * @returns {Promise<object|null>}
 */
export async function findById(employeeId) {
  if (!employeeId) return null;

  const sql = `
    SELECT 
      e.employee_id,
      e.employee_code,
      e.full_name,
      e.email,
      e.phone,
      e.address,
      e.gender,
      e.date_of_birth,
      e.ssn_masked,
      e.department_id,
      d.department_name,
      d.department_code,
      e.position,
      e.base_salary,
      e.hire_date,
      e.employment_status,
      e.created_at,
      e.updated_at,
      u.user_id,
      u.username,
      u.role AS user_role,
      u.account_status AS user_account_status
    FROM \`employees\` e
    LEFT JOIN \`departments\` d ON e.department_id = d.department_id
    LEFT JOIN \`users\` u ON u.employee_id = e.employee_id
    WHERE e.employee_id = ?
    LIMIT 1
  `;

  const rows = await query(sql, [employeeId]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Tự động sinh mã nhân viên kế tiếp theo quy chuẩn (vd: NV006)
 * @returns {Promise<string>}
 */
export async function generateNextEmployeeCode() {
  const sql = `
    SELECT employee_code 
    FROM \`employees\` 
    WHERE employee_code REGEXP '^NV[0-9]+$' 
    ORDER BY LENGTH(employee_code) DESC, employee_code DESC 
    LIMIT 1
  `;

  const rows = await query(sql);
  if (rows.length === 0) {
    return 'NV001';
  }

  const lastCode = rows[0].employee_code;
  const numPart = lastCode.replace('NV', '');
  const nextNum = parseInt(numPart, 10) + 1;
  const padLength = Math.max(numPart.length, 3);

  return `NV${String(nextNum).padStart(padLength, '0')}`;
}

/**
 * Thêm mới nhân sự vào cơ sở dữ liệu
 * Mã hóa CCCD bằng hàm AES_ENCRYPT của MySQL qua prepared statement
 * 
 * @param {object} employeeData
 * @param {string} employeeData.employeeCode
 * @param {string} employeeData.fullName
 * @param {string|null} employeeData.email
 * @param {string|null} employeeData.phone
 * @param {string|null} employeeData.address
 * @param {string} employeeData.gender
 * @param {string|null} employeeData.dateOfBirth
 * @param {string} employeeData.cccdPlain - Số CCCD dạng thô (truyền vào hàm AES_ENCRYPT)
 * @param {string} employeeData.ssnMasked - Số CCCD đã che mờ
 * @param {string} employeeData.ssnHash - Mã băm HMAC-SHA-256
 * @param {number} employeeData.departmentId
 * @param {string} employeeData.position
 * @param {number} employeeData.baseSalary
 * @param {string} employeeData.hireDate
 * @param {string} employeeData.employmentStatus
 * @param {string} cccdEncryptionKey - Khóa bảo mật mã hóa AES của MySQL
 * @returns {Promise<number>} ID nhân sự vừa tạo (employee_id)
 */
export async function create(employeeData, cccdEncryptionKey) {
  if (!cccdEncryptionKey) {
    throw new Error('Khóa mã hóa CCCD_ENCRYPTION_KEY không được để trống khi thực hiện tạo nhân sự.');
  }

  const sql = `
    INSERT INTO \`employees\` (
      \`employee_code\`,
      \`full_name\`,
      \`email\`,
      \`phone\`,
      \`address\`,
      \`gender\`,
      \`date_of_birth\`,
      \`ssn_encrypted\`,
      \`ssn_masked\`,
      \`ssn_hash\`,
      \`department_id\`,
      \`position\`,
      \`base_salary\`,
      \`hire_date\`,
      \`employment_status\`
    ) VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      AES_ENCRYPT(?, ?),
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?
    )
  `;

  const params = [
    employeeData.employeeCode,
    employeeData.fullName,
    employeeData.email || null,
    employeeData.phone || null,
    employeeData.address || null,
    employeeData.gender || 'Male',
    employeeData.dateOfBirth || null,
    employeeData.cccdPlain, // Truyền vào tham số thứ nhất của AES_ENCRYPT(?, ?)
    cccdEncryptionKey,      // Khóa mã hóa là tham số thứ hai của AES_ENCRYPT(?, ?)
    employeeData.ssnMasked,
    employeeData.ssnHash,
    employeeData.departmentId,
    employeeData.position || 'Nhân viên',
    employeeData.baseSalary || 0,
    employeeData.hireDate,
    employeeData.employmentStatus || 'Active',
  ];

  const result = await query(sql, params);
  return result.insertId;
}

/**
 * Tìm kiếm nhân viên theo ID kèm giải mã CCCD trực tiếp bằng MySQL AES_DECRYPT()
 * Áp dụng 100% Prepared Statements / Parameterized Queries chống SQL Injection.
 * Bảo mật:
 * - Chỉ SELECT các cột cần thiết, tuyệt đối không dùng SELECT *
 * - Không trả về ciphertext ssn_encrypted hoặc mã băm ssn_hash
 * - Khóa mã hóa được truyền qua tham số truy vấn của prepared statement
 * 
 * @param {number} employeeId - ID nhân viên (EmployeeID)
 * @param {string} cccdEncryptionKey - Khóa bảo mật giải mã AES
 * @returns {Promise<object|null>}
 */
export async function findByIdWithDecryptedCccd(employeeId, cccdEncryptionKey) {
  if (!employeeId || !cccdEncryptionKey) return null;

  const sql = `
    SELECT 
      e.employee_id,
      e.employee_code,
      e.full_name,
      e.email,
      e.phone,
      e.address,
      e.gender,
      e.date_of_birth,
      CAST(AES_DECRYPT(e.ssn_encrypted, ?) AS CHAR CHARACTER SET utf8mb4) AS cccd,
      e.department_id,
      d.department_name,
      d.department_code,
      e.position,
      e.base_salary,
      e.hire_date,
      e.employment_status,
      e.created_at,
      e.updated_at
    FROM \`employees\` e
    LEFT JOIN \`departments\` d ON e.department_id = d.department_id
    WHERE e.employee_id = ?
    LIMIT 1
  `;

  const rows = await query(sql, [cccdEncryptionKey, employeeId]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Lấy danh sách nhân viên có phân trang, hỗ trợ lọc theo phòng ban và tìm kiếm
 * Sử dụng 100% Prepared Statements / Parameterized Queries chống SQL Injection.
 * Bảo mật: Tuyệt đối không SELECT ssn_encrypted hoặc ssn_hash hoặc AES_DECRYPT.
 * 
 * @param {object} options
 * @param {number} [options.page=1]
 * @param {number} [options.limit=10]
 * @param {number|null} [options.departmentId=null]
 * @param {string} [options.search='']
 * @returns {Promise<object[]>}
 */
export async function findAll({ page = 1, limit = 10, departmentId = null, search = '' } = {}) {
  const whereClauses = [];
  const params = [];

  if (departmentId !== null && departmentId !== undefined) {
    whereClauses.push('e.department_id = ?');
    params.push(Number(departmentId));
  }

  if (search && typeof search === 'string' && search.trim() !== '') {
    const cleanSearch = search.trim().replace(/([%_\\])/g, '\\$1');
    whereClauses.push('(e.employee_code LIKE ? OR e.full_name LIKE ?)');
    params.push(`%${cleanSearch}%`, `%${cleanSearch}%`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const offset = (Number(page) - 1) * Number(limit);

  const sql = `
    SELECT 
      e.employee_id,
      e.employee_code,
      e.full_name,
      e.email,
      e.phone,
      e.address,
      e.gender,
      e.date_of_birth,
      e.department_id,
      d.department_name,
      d.department_code,
      e.position,
      e.base_salary,
      e.hire_date,
      e.employment_status,
      e.created_at,
      e.updated_at
    FROM \`employees\` e
    LEFT JOIN \`departments\` d ON e.department_id = d.department_id
    ${whereSql}
    ORDER BY e.employee_id DESC
    LIMIT ? OFFSET ?
  `;

  const rows = await query(sql, [...params, Number(limit), Number(offset)]);
  return rows;
}

/**
 * Đếm tổng số nhân viên thỏa mãn điều kiện lọc và tìm kiếm (Count Query)
 * @param {object} options
 * @param {number|null} [options.departmentId=null]
 * @param {string} [options.search='']
 * @returns {Promise<number>}
 */
export async function countAll({ departmentId = null, search = '' } = {}) {
  const whereClauses = [];
  const params = [];

  if (departmentId !== null && departmentId !== undefined) {
    whereClauses.push('e.department_id = ?');
    params.push(Number(departmentId));
  }

  if (search && typeof search === 'string' && search.trim() !== '') {
    const cleanSearch = search.trim().replace(/([%_\\])/g, '\\$1');
    whereClauses.push('(e.employee_code LIKE ? OR e.full_name LIKE ?)');
    params.push(`%${cleanSearch}%`, `%${cleanSearch}%`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = `
    SELECT COUNT(*) AS total
    FROM \`employees\` e
    LEFT JOIN \`departments\` d ON e.department_id = d.department_id
    ${whereSql}
  `;

  const rows = await query(sql, params);
  return Number(rows[0]?.total || 0);
}

/**
 * Xóa nhân sự theo ID (Chỉ dùng cho mục đích kiểm thử và rollback)
 * @param {number} employeeId
 * @returns {Promise<boolean>}
 */
export async function deleteById(employeeId) {
  if (!employeeId) return false;
  const result = await query('DELETE FROM `employees` WHERE employee_id = ?', [employeeId]);
  return result.affectedRows > 0;
}

export default {
  findByCode,
  findBySsnHash,
  findByEmail,
  findById,
  findByIdWithDecryptedCccd,
  generateNextEmployeeCode,
  create,
  deleteById,
  findAll,
  countAll,
};

