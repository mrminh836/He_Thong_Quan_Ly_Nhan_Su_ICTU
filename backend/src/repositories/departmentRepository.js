import { query, withTransaction } from '../config/database.js';

/**
 * Ánh xạ các cột được phép sắp xếp để chống SQL Injection
 */
const ALLOWED_SORT_COLUMNS = {
  id: 'd.department_id',
  department_id: 'd.department_id',
  departmentId: 'd.department_id',
  name: 'd.department_name',
  department_name: 'd.department_name',
  departmentName: 'd.department_name',
  code: 'd.department_code',
  department_code: 'd.department_code',
  departmentCode: 'd.department_code',
  created_at: 'd.created_at',
  createdAt: 'd.created_at',
};

/**
 * Chuẩn hóa đối tượng phòng ban đầu ra
 */
export function formatDepartment(dept) {
  if (!dept) return null;
  return {
    id: dept.department_id,
    departmentId: dept.department_id,
    departmentCode: dept.department_code,
    departmentName: dept.department_name,
    location: dept.location ?? null,
    phone: dept.phone ?? null,
    description: dept.description ?? null,
    isActive: Boolean(dept.is_active),
    employeeCount: Number(dept.employee_count || 0),
    createdAt: dept.created_at,
    updatedAt: dept.updated_at,
  };
}

/**
 * Lấy danh sách phòng ban có phân trang, tìm kiếm và thống kê số lượng nhân sự
 * 100% Parameterized queries
 */
export async function findAll({
  page = 1,
  limit = 10,
  search = '',
  sortBy = 'department_id',
  sortOrder = 'ASC',
  isActive = null,
} = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
  const offset = (safePage - 1) * safeLimit;

  const whereConditions = [];
  const whereParams = [];

  if (search && typeof search === 'string' && search.trim() !== '') {
    const trimmed = search.trim();
    whereConditions.push('(d.department_name LIKE ? OR d.department_code LIKE ?)');
    whereParams.push(`%${trimmed}%`, `%${trimmed}%`);
  }

  if (isActive !== null && isActive !== undefined) {
    whereConditions.push('d.is_active = ?');
    whereParams.push(isActive ? 1 : 0);
  }

  const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // 1. Đếm tổng số bản ghi (Count total)
  const countSql = `
    SELECT COUNT(DISTINCT d.department_id) AS total
    FROM \`departments\` d
    ${whereSql}
  `;
  const countRows = await query(countSql, [...whereParams]);
  const total = countRows[0]?.total || 0;

  // 2. Sắp xếp an toàn qua Whitelist
  const sortColumn = ALLOWED_SORT_COLUMNS[sortBy] || 'd.department_id';
  const sortDirection = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  // 3. Lấy dữ liệu kèm nhân viên đếm qua LEFT JOIN
  const dataSql = `
    SELECT 
      d.department_id,
      d.department_code,
      d.department_name,
      d.location,
      d.phone,
      d.description,
      d.is_active,
      d.created_at,
      d.updated_at,
      COUNT(e.employee_id) AS employee_count
    FROM \`departments\` d
    LEFT JOIN \`employees\` e ON d.department_id = e.department_id
    ${whereSql}
    GROUP BY d.department_id
    ORDER BY ${sortColumn} ${sortDirection}
    LIMIT ? OFFSET ?
  `;

  const rows = await query(dataSql, [...whereParams, safeLimit, offset]);

  return {
    items: rows.map(formatDepartment),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit) || 1,
  };
}

/**
 * Tìm phòng ban theo ID kèm số nhân sự
 * @param {number} departmentId
 * @returns {Promise<object|null>}
 */
export async function findById(departmentId) {
  if (!departmentId || isNaN(departmentId)) return null;

  const sql = `
    SELECT 
      d.department_id,
      d.department_code,
      d.department_name,
      d.location,
      d.phone,
      d.description,
      d.is_active,
      d.created_at,
      d.updated_at,
      COUNT(e.employee_id) AS employee_count
    FROM \`departments\` d
    LEFT JOIN \`employees\` e ON d.department_id = e.department_id
    WHERE d.department_id = ?
    GROUP BY d.department_id
    LIMIT 1
  `;

  const rows = await query(sql, [departmentId]);
  return rows.length > 0 ? formatDepartment(rows[0]) : null;
}

/**
 * Tìm phòng ban theo Tên (chính xác, không phân biệt hoa thường)
 * @param {string} name
 * @returns {Promise<object|null>}
 */
export async function findByName(name) {
  if (!name || typeof name !== 'string') return null;

  const sql = `
    SELECT * FROM \`departments\`
    WHERE \`department_name\` = ?
    LIMIT 1
  `;
  const rows = await query(sql, [name.trim()]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Tìm phòng ban theo Tên ngoại trừ một ID xác định (dùng khi cập nhật)
 * @param {string} name
 * @param {number} excludeId
 * @returns {Promise<object|null>}
 */
export async function findByNameExcludingId(name, excludeId) {
  if (!name || typeof name !== 'string' || !excludeId) return null;

  const sql = `
    SELECT * FROM \`departments\`
    WHERE \`department_name\` = ? AND \`department_id\` <> ?
    LIMIT 1
  `;
  const rows = await query(sql, [name.trim(), excludeId]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Tìm phòng ban theo Mã (department_code)
 * Sử dụng chỉ mục uk_departments_code trong MySQL
 * @param {string} code
 * @returns {Promise<object|null>}
 */
export async function findByCode(code) {
  if (!code || typeof code !== 'string') return null;

  const sql = `
    SELECT * FROM \`departments\`
    WHERE \`department_code\` = ?
    LIMIT 1
  `;
  const rows = await query(sql, [code.trim()]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Tìm phòng ban theo Mã ngoại trừ một ID xác định (dùng khi cập nhật để validate trùng mã)
 * Sử dụng parameterized query và B-Tree Index uk_departments_code
 * @param {string} code
 * @param {number} excludeId
 * @returns {Promise<object|null>}
 */
export async function findByCodeExcludingId(code, excludeId) {
  if (!code || typeof code !== 'string' || !excludeId) return null;

  const sql = `
    SELECT * FROM \`departments\`
    WHERE \`department_code\` = ? AND \`department_id\` <> ?
    LIMIT 1
  `;
  const rows = await query(sql, [code.trim(), excludeId]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Đếm số lượng nhân viên trực thuộc phòng ban (kiểm tra toàn vẹn khóa ngoại)
 * @param {number} departmentId
 * @param {object|null} connection
 * @returns {Promise<number>}
 */
export async function countEmployeesByDepartmentId(departmentId, connection = null) {
  if (!departmentId || isNaN(departmentId)) return 0;

  const sql = `
    SELECT COUNT(*) AS employeeCount
    FROM \`employees\`
    WHERE \`department_id\` = ?
  `;
  if (connection) {
    const [rows] = await connection.execute(sql, [departmentId]);
    return Number(rows[0]?.employeeCount ?? rows[0]?.total ?? 0);
  }
  const rows = await query(sql, [departmentId]);
  return Number(rows[0]?.employeeCount ?? rows[0]?.total ?? 0);
}

/**
 * Kiểm tra xem có bất kỳ nhân viên nào đang tham chiếu tới phòng ban hay không
 * Bao gồm tất cả nhân viên (kể cả nhân viên đã nghỉ việc 'Resigned' nếu còn liên kết)
 * Sử dụng truy vấn SELECT EXISTS có tham số, chống SQL Injection
 * @param {number} departmentId
 * @param {object|null} connection
 * @returns {Promise<boolean>}
 */
export async function hasEmployees(departmentId, connection = null) {
  if (!departmentId || isNaN(departmentId)) return false;

  const sql = `
    SELECT EXISTS (
      SELECT 1
      FROM \`employees\`
      WHERE \`department_id\` = ?
    ) AS has_employees
  `;

  if (connection) {
    const [rows] = await connection.execute(sql, [departmentId]);
    return Boolean(rows[0]?.has_employees);
  }

  const rows = await query(sql, [departmentId]);
  return Boolean(rows[0]?.has_employees);
}

/**
 * Tìm phòng ban theo ID và khóa hàng bi quan (SELECT ... FOR UPDATE)
 * Sử dụng trong transaction để ngăn ngừa race condition khi cập nhật / xóa đồng thời
 * @param {number} departmentId
 * @param {object|null} connection
 * @returns {Promise<object|null>}
 */
export async function findByIdForUpdate(departmentId, connection = null) {
  if (!departmentId || isNaN(departmentId)) return null;

  const sql = `
    SELECT * FROM \`departments\`
    WHERE \`department_id\` = ?
    FOR UPDATE
  `;

  if (connection) {
    const [rows] = await connection.execute(sql, [departmentId]);
    return rows.length > 0 ? formatDepartment(rows[0]) : null;
  }

  const rows = await query(sql, [departmentId]);
  return rows.length > 0 ? formatDepartment(rows[0]) : null;
}

/**
 * Tạo mới phòng ban
 * @param {object} param0
 * @returns {Promise<number>} ID của phòng ban vừa tạo
 */
export async function create({
  departmentCode,
  departmentName,
  location = null,
  phone = null,
  description = null,
  isActive = true,
}) {
  const sql = `
    INSERT INTO \`departments\` (
      \`department_code\`, 
      \`department_name\`, 
      \`location\`, 
      \`phone\`, 
      \`description\`, 
      \`is_active\`
    ) VALUES (?, ?, ?, ?, ?, ?)
  `;

  const result = await query(sql, [
    departmentCode.trim(),
    departmentName.trim(),
    location ? location.trim() : null,
    phone ? phone.trim() : null,
    description ? description.trim() : null,
    isActive ? 1 : 0,
  ]);

  return result.insertId;
}

/**
 * Cập nhật thông tin phòng ban
 * @param {number} departmentId
 * @param {object} updates
 * @returns {Promise<boolean>}
 */
export async function update(departmentId, updates = {}) {
  if (!departmentId || isNaN(departmentId)) return false;

  const setClauses = [];
  const params = [];

  if (updates.departmentName !== undefined) {
    setClauses.push('`department_name` = ?');
    params.push(updates.departmentName.trim());
  }

  if (updates.departmentCode !== undefined) {
    setClauses.push('`department_code` = ?');
    params.push(updates.departmentCode.trim());
  }

  if (updates.location !== undefined) {
    setClauses.push('`location` = ?');
    params.push(updates.location ? updates.location.trim() : null);
  }

  if (updates.phone !== undefined) {
    setClauses.push('`phone` = ?');
    params.push(updates.phone ? updates.phone.trim() : null);
  }

  if (updates.description !== undefined) {
    setClauses.push('`description` = ?');
    params.push(updates.description ? updates.description.trim() : null);
  }

  if (updates.isActive !== undefined) {
    setClauses.push('`is_active` = ?');
    params.push(updates.isActive ? 1 : 0);
  }

  if (setClauses.length === 0) {
    return false;
  }

  setClauses.push('`updated_at` = CURRENT_TIMESTAMP');

  const sql = `
    UPDATE \`departments\`
    SET ${setClauses.join(', ')}
    WHERE \`department_id\` = ?
  `;

  params.push(departmentId);
  const result = await query(sql, params);
  return result.affectedRows > 0;
}

/**
 * Xóa vật lý phòng ban (khi không còn nhân sự trực thuộc)
 * @param {number} departmentId
 * @param {object|null} connection
 * @returns {Promise<boolean>}
 */
export async function deleteById(departmentId, connection = null) {
  if (!departmentId || isNaN(departmentId)) return false;

  const sql = 'DELETE FROM `departments` WHERE `department_id` = ?';
  if (connection) {
    const [result] = await connection.execute(sql, [departmentId]);
    return result.affectedRows > 0;
  }
  const result = await query(sql, [departmentId]);
  return result.affectedRows > 0;
}

/**
 * Xóa mềm phòng ban (Soft delete)
 * @param {number} departmentId
 * @param {object|null} connection
 * @returns {Promise<boolean>}
 */
export async function softDeleteById(departmentId, connection = null) {
  if (!departmentId || isNaN(departmentId)) return false;

  const sql = `
    UPDATE \`departments\`
    SET \`is_active\` = 0, \`updated_at\` = CURRENT_TIMESTAMP
    WHERE \`department_id\` = ?
  `;
  if (connection) {
    const [result] = await connection.execute(sql, [departmentId]);
    return result.affectedRows > 0;
  }
  const result = await query(sql, [departmentId]);
  return result.affectedRows > 0;
}

/**
 * Xóa phòng ban trong một MySQL Transaction với khóa dòng FOR UPDATE
 * Ngăn chặn xung đột dữ liệu (race condition) khi có request đồng thời
 * @param {number} departmentId
 * @param {object} options
 * @returns {Promise<{ found: boolean, hasEmployees: boolean, isDeleted?: boolean, type?: string, department?: object }>}
 */
export async function deleteDepartmentWithLock(departmentId, { isSoftDelete = false } = {}) {
  return await withTransaction(async (conn) => {
    // 1. Khóa bi quan bản ghi phòng ban cần xóa (FOR UPDATE)
    const [deptRows] = await conn.execute(
      'SELECT * FROM `departments` WHERE `department_id` = ? FOR UPDATE',
      [departmentId]
    );

    if (deptRows.length === 0) {
      return { found: false, hasEmployees: false, isDeleted: false };
    }

    const department = formatDepartment(deptRows[0]);

    // 2. Kiểm tra tồn tại nhân viên tham chiếu đến phòng ban bằng khóa ngoại thực tế (employees.department_id)
    const [countRows] = await conn.execute(
      'SELECT COUNT(*) AS employeeCount FROM `employees` WHERE `department_id` = ?',
      [departmentId]
    );

    const employeeCount = Number(countRows[0]?.employeeCount ?? countRows[0]?.total ?? 0);
    const hasEmp = employeeCount > 0;
    if (hasEmp) {
      return {
        found: true,
        hasEmployees: true,
        employeeCount,
        isDeleted: false,
        department,
      };
    }

    // 3. Thực hiện xóa khi không còn nhân sự trực thuộc
    if (isSoftDelete) {
      await conn.execute(
        'UPDATE `departments` SET `is_active` = 0, `updated_at` = CURRENT_TIMESTAMP WHERE `department_id` = ?',
        [departmentId]
      );
      return {
        found: true,
        hasEmployees: false,
        isDeleted: true,
        type: 'SOFT_DELETE',
        department,
      };
    }

    await conn.execute('DELETE FROM `departments` WHERE `department_id` = ?', [departmentId]);
    return {
      found: true,
      hasEmployees: false,
      isDeleted: true,
      type: 'HARD_DELETE',
      department,
    };
  });
}

/**
 * Thống kê số lượng nhân viên hiện tại theo từng phòng ban
 * Sử dụng LEFT JOIN để bảo đảm phòng ban có 0 nhân viên vẫn xuất hiện với employeeCount = 0
 * Lọc chính xác nhân viên hiện tại (Active, OnLeave) và loại trừ nhân viên đã thôi việc (Resigned)
 * 100% Parameterized query, chống SQL Injection
 * 
 * @param {object} options
 * @param {string} [options.departmentStatus='all'] 'all' | 'active' | 'inactive'
 * @param {string} [options.sortBy='employee_count'] 'employee_count' | 'department_name' | 'department_code'
 * @param {string} [options.sortOrder='DESC'] 'ASC' | 'DESC'
 * @returns {Promise<Array<{ departmentId: number, departmentCode: string, departmentName: string, isActive: boolean, employeeCount: number, activeCount: number, onLeaveCount: number, resignedCount: number }>>}
 */
export async function getDepartmentEmployeeStats({
  departmentStatus = 'all',
  sortBy = 'employee_count',
  sortOrder = 'DESC',
} = {}) {
  const whereClauses = [];
  const params = [];

  if (departmentStatus === 'active') {
    whereClauses.push('d.is_active = 1');
  } else if (departmentStatus === 'inactive') {
    whereClauses.push('d.is_active = 0');
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const ALLOWED_STATS_SORT = {
    employee_count: 'employee_count',
    employeeCount: 'employee_count',
    count: 'employee_count',
    department_name: 'd.department_name',
    departmentName: 'd.department_name',
    name: 'd.department_name',
    department_code: 'd.department_code',
    departmentCode: 'd.department_code',
    code: 'd.department_code',
    department_id: 'd.department_id',
    departmentId: 'd.department_id',
    id: 'd.department_id',
  };

  const sortColumn = ALLOWED_STATS_SORT[sortBy] || 'employee_count';
  const sortDirection = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const sql = `
    SELECT 
      d.department_id,
      d.department_code,
      d.department_name,
      d.is_active,
      COUNT(CASE WHEN e.employment_status IN ('Active', 'OnLeave') THEN e.employee_id END) AS employee_count,
      COUNT(CASE WHEN e.employment_status = 'Active' THEN e.employee_id END) AS active_count,
      COUNT(CASE WHEN e.employment_status = 'OnLeave' THEN e.employee_id END) AS on_leave_count,
      COUNT(CASE WHEN e.employment_status = 'Resigned' THEN e.employee_id END) AS resigned_count
    FROM \`departments\` d
    LEFT JOIN \`employees\` e ON d.department_id = e.department_id
    ${whereSql}
    GROUP BY 
      d.department_id,
      d.department_code,
      d.department_name,
      d.is_active
    ORDER BY ${sortColumn} ${sortDirection}, d.department_id ASC
  `;

  const rows = await query(sql, params);

  return rows.map((row) => ({
    departmentId: row.department_id,
    departmentCode: row.department_code,
    departmentName: row.department_name,
    isActive: Boolean(row.is_active),
    employeeCount: Number(row.employee_count || 0),
    activeCount: Number(row.active_count || 0),
    onLeaveCount: Number(row.on_leave_count || 0),
    resignedCount: Number(row.resigned_count || 0),
  }));
}

export default {
  findAll,
  findById,
  findByName,
  findByNameExcludingId,
  findByCode,
  findByCodeExcludingId,
  countEmployeesByDepartmentId,
  hasEmployees,
  findByIdForUpdate,
  getDepartmentEmployeeStats,
  create,
  update,
  deleteById,
  softDeleteById,
  deleteDepartmentWithLock,
  formatDepartment,
};

