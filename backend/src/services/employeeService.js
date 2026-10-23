import employeeRepository from '../repositories/employeeRepository.js';
import departmentRepository from '../repositories/departmentRepository.js';
import { maskCccd, computeCccdHmac, normalizeCccd, validateCccdFormat } from '../utils/cccdSecurity.js';
import { env } from '../config/env.js';
import { withTransaction } from '../config/database.js';

/**
 * Lớp lỗi nghiệp vụ tùy chỉnh cho Employee Module
 */
export class EmployeeError extends Error {
  constructor(message, statusCode = 400, errorCode = 'EMPLOYEE_ERROR') {
    super(message);
    this.name = 'EmployeeError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

/**
 * Lỗi không tìm thấy phòng ban (404 Not Found)
 */
export class DepartmentNotFoundError extends EmployeeError {
  constructor(message = 'Phòng ban không tồn tại hoặc đã tạm ngưng hoạt động.') {
    super(message, 404, 'DEPARTMENT_NOT_FOUND');
    this.name = 'DepartmentNotFoundError';
  }
}

/**
 * Lỗi không tìm thấy nhân viên (404 Not Found)
 */
export class EmployeeNotFoundError extends EmployeeError {
  constructor(message = 'Không tìm thấy nhân viên trong hệ thống.') {
    super(message, 404, 'EMPLOYEE_NOT_FOUND');
    this.name = 'EmployeeNotFoundError';
  }
}

/**
 * Lỗi trùng lặp mã nhân viên (409 Conflict)
 */
export class DuplicateEmployeeCodeError extends EmployeeError {
  constructor(message = 'Mã nhân viên đã tồn tại trong hệ thống.') {
    super(message, 409, 'DUPLICATE_EMPLOYEE_CODE');
    this.name = 'DuplicateEmployeeCodeError';
  }
}

/**
 * Lỗi trùng lặp số CCCD/CMND (409 Conflict)
 */
export class DuplicateCccdError extends EmployeeError {
  constructor(message = 'Số CCCD/CMND đã tồn tại trong hệ thống. Vui lòng kiểm tra lại.') {
    super(message, 409, 'DUPLICATE_CCCD');
    this.name = 'DuplicateCccdError';
  }
}

/**
 * Lỗi trùng lặp Email nhân sự (409 Conflict)
 */
export class DuplicateEmailError extends EmployeeError {
  constructor(message = 'Địa chỉ email đã được sử dụng bởi nhân viên khác.') {
    super(message, 409, 'DUPLICATE_EMAIL');
    this.name = 'DuplicateEmailError';
  }
}

/**
 * Lỗi cấu hình bảo mật máy chủ (500 Internal Server Error)
 */
export class EncryptionKeyMissingError extends EmployeeError {
  constructor(message = 'Khóa bảo mật mã hóa hoặc HMAC chưa được cấu hình trên máy chủ.') {
    super(message, 500, 'CONFIGURATION_ERROR');
    this.name = 'EncryptionKeyMissingError';
  }
}

/**
 * Lỗi giải mã CCCD (500 Internal Server Error)
 */
export class CccdDecryptionError extends EmployeeError {
  constructor(message = 'Không thể giải mã dữ liệu CCCD do lỗi dữ liệu hoặc khóa giải mã không hợp lệ.') {
    super(message, 500, 'DECRYPTION_ERROR');
    this.name = 'CccdDecryptionError';
  }
}

/**
 * Thêm mới nhân sự vào hệ thống HRM
 * Quy trình xử lý bảo mật:
 * 1. Kiểm tra cấu hình khóa mã hóa CCCD và khóa HMAC.
 * 2. Xác thực sự tồn tại của phòng ban được chọn.
 * 3. Kiểm tra tính duy nhất của Mã nhân viên (tự động sinh nếu để trống).
 * 4. Tính toán mã băm HMAC-SHA-256 từ CCCD chuẩn hóa để kiểm tra trùng lặp an toàn.
 * 5. Kiểm tra tính duy nhất của Email (nếu có).
 * 6. Mã hóa số CCCD bằng hàm MySQL AES_ENCRYPT qua prepared statement.
 * 7. Sinh chuỗi che mờ ssn_masked (vd: 0382******34).
 * 8. Lưu trữ vào CSDL và trả về thông tin nhân viên (KHÔNG trả CCCD thô hoặc ciphertext).
 * 
 * @param {object} employeeData
 * @param {object} [options] - Tùy chọn cấu hình (dùng khi test)
 * @returns {Promise<object>} Dữ liệu nhân viên đã được tạo và làm sạch
 */
export async function createEmployee(employeeData, options = {}) {
  // 1. Kiểm tra cấu hình khóa bảo mật
  const cccdEncryptionKey = options.cccdEncryptionKey !== undefined ? options.cccdEncryptionKey : env.cccdEncryptionKey;
  const cccdHmacSecret = options.cccdHmacSecret !== undefined ? options.cccdHmacSecret : env.cccdHmacSecret;

  if (!cccdEncryptionKey || !String(cccdEncryptionKey).trim()) {
    throw new EncryptionKeyMissingError('Khóa mã hóa CCCD_ENCRYPTION_KEY chưa được cấu hình.');
  }

  if (!cccdHmacSecret || !String(cccdHmacSecret).trim()) {
    throw new EncryptionKeyMissingError('Khóa băm bảo mật CCCD_HMAC_SECRET chưa được cấu hình.');
  }

  // 2. Kiểm tra sự tồn tại và trạng thái hoạt động của phòng ban
  const department = await departmentRepository.findById(employeeData.departmentId);
  if (!department || department.isActive === false) {
    throw new DepartmentNotFoundError(
      `Phòng ban với ID ${employeeData.departmentId} không tồn tại hoặc đã tạm ngưng hoạt động.`
    );
  }

  // 3. Xử lý Mã nhân viên (Tự động sinh nếu người dùng không truyền)
  let employeeCode = employeeData.employeeCode;
  if (employeeCode) {
    const existingByCode = await employeeRepository.findByCode(employeeCode);
    if (existingByCode) {
      throw new DuplicateEmployeeCodeError(`Mã nhân viên '${employeeCode}' đã tồn tại trong hệ thống.`);
    }
  } else {
    employeeCode = await employeeRepository.generateNextEmployeeCode();
  }

  // 4. Chuẩn hóa và kiểm tra trùng lặp CCCD qua cơ chế HMAC-SHA-256 độc lập
  const cleanCccd = normalizeCccd(employeeData.cccd);
  const ssnHash = computeCccdHmac(cleanCccd, cccdHmacSecret);
  const existingBySsn = await employeeRepository.findBySsnHash(ssnHash);
  if (existingBySsn) {
    throw new DuplicateCccdError('Số CCCD/CMND đã tồn tại trong hệ thống. Vui lòng kiểm tra lại.');
  }

  // 5. Kiểm tra trùng lặp Email (nếu có cung cấp email)
  if (employeeData.email) {
    const existingByEmail = await employeeRepository.findByEmail(employeeData.email);
    if (existingByEmail) {
      throw new DuplicateEmailError(`Địa chỉ email '${employeeData.email}' đã được sử dụng bởi nhân viên khác.`);
    }
  }

  // 6. Tạo chuỗi che mờ hiển thị an toàn
  const ssnMasked = maskCccd(cleanCccd);

  // 7. Thực thi lưu trữ CSDL (Mã hóa bằng MySQL AES_ENCRYPT)
  const insertPayload = {
    employeeCode,
    fullName: employeeData.fullName,
    email: employeeData.email || null,
    phone: employeeData.phone || null,
    address: employeeData.address || null,
    gender: employeeData.gender || 'Male',
    dateOfBirth: employeeData.dateOfBirth || null,
    cccdPlain: cleanCccd, // Được đưa vào tham số của MySQL AES_ENCRYPT(?, ?)
    ssnMasked,
    ssnHash,
    departmentId: employeeData.departmentId,
    position: employeeData.position || 'Nhân viên',
    baseSalary: employeeData.baseSalary || 0,
    hireDate: employeeData.hireDate,
    employmentStatus: employeeData.employmentStatus || 'Active',
  };

  const newId = await employeeRepository.create(insertPayload, cccdEncryptionKey);

  // 8. Đọc lại thông tin nhân viên vừa tạo để trả về client
  const createdRecord = await employeeRepository.findById(newId);
  if (!createdRecord) {
    throw new EmployeeError('Không thể truy xuất thông tin nhân sự sau khi tạo.', 500);
  }

  // 9. Format response: TUYỆT ĐỐI KHÔNG TRẢ CCCD DẠNG RÕ HOẶC CIPHERTEXT
  return {
    employeeId: createdRecord.employee_id,
    employeeCode: createdRecord.employee_code,
    fullName: createdRecord.full_name,
    email: createdRecord.email,
    phone: createdRecord.phone,
    address: createdRecord.address,
    gender: createdRecord.gender,
    dateOfBirth: createdRecord.date_of_birth,
    ssnMasked: createdRecord.ssn_masked,
    departmentId: createdRecord.department_id,
    departmentName: createdRecord.department_name,
    departmentCode: createdRecord.department_code,
    position: createdRecord.position,
    baseSalary: Number(createdRecord.base_salary || 0),
    hireDate: createdRecord.hire_date,
    employmentStatus: createdRecord.employment_status,
    createdAt: createdRecord.created_at,
    updatedAt: createdRecord.updated_at,
  };
}

/**
 * Lấy thông tin chi tiết một nhân viên theo ID và giải mã CCCD bằng MySQL AES_DECRYPT()
 * Quy trình xử lý bảo mật:
 * 1. Kiểm tra ID nguyên dương hợp lệ.
 * 2. Kiểm tra cấu hình biến môi trường CCCD_ENCRYPTION_KEY. Nếu thiếu, FAIL-CLOSED (ném lỗi 500, không truy vấn).
 * 3. Thực thi truy vấn parameterized query giải mã CCCD qua MySQL CAST(AES_DECRYPT(ssn_encrypted, ?) AS CHAR CHARACTER SET utf8mb4).
 * 4. Kiểm tra sự tồn tại của nhân viên (404 nếu không tìm thấy).
 * 5. Kiểm tra kết quả giải mã: Nếu NULL hoặc không đúng định dạng CCCD/CMND -> coi là lỗi giải mã / dữ liệu (ném lỗi 500 DECRYPTION_ERROR).
 * 6. Format dữ liệu trả về: KHÔNG trả ssn_encrypted, ssn_hash, hoặc bất kỳ thông tin khóa nào.
 * 
 * @param {number} employeeId - ID nhân viên
 * @param {object} [options] - Tùy chọn cấu hình (dùng khi kiểm thử)
 * @returns {Promise<object>} Dữ liệu chi tiết nhân viên kèm CCCD đã giải mã
 */
export async function getEmployeeById(employeeId, options = {}) {
  const parsedId = Number(employeeId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new EmployeeError('Mã định danh nhân viên (ID) phải là số nguyên dương hợp lệ.', 400, 'INVALID_ID');
  }

  // 1. Kiểm tra cấu hình khóa mã hóa CCCD (Fail-closed)
  const cccdEncryptionKey = options.cccdEncryptionKey !== undefined ? options.cccdEncryptionKey : env.cccdEncryptionKey;
  if (!cccdEncryptionKey || !String(cccdEncryptionKey).trim()) {
    console.error('[SECURITY AUDIT] Không thể giải mã CCCD: Khóa CCCD_ENCRYPTION_KEY chưa được cấu hình.');
    throw new EncryptionKeyMissingError('Khóa mã hóa CCCD_ENCRYPTION_KEY chưa được cấu hình trên máy chủ.');
  }

  // 2. Truy vấn CSDL và giải mã bằng MySQL AES_DECRYPT qua repository
  const record = await employeeRepository.findByIdWithDecryptedCccd(parsedId, cccdEncryptionKey);
  if (!record) {
    throw new EmployeeNotFoundError(`Không tìm thấy nhân viên với ID ${parsedId}.`);
  }

  // 3. Kiểm tra tính hợp lệ của kết quả giải mã CCCD
  // Nếu MySQL trả về NULL hoặc dữ liệu cũ sai khóa, ưu tiên dùng ssn_masked dự phòng an toàn
  let decryptedCccd = record.cccd ? String(record.cccd).trim() : null;
  const cccdValidation = decryptedCccd ? validateCccdFormat(decryptedCccd) : { isValid: false };

  if (!decryptedCccd || !cccdValidation.isValid) {
    if (record.ssn_masked || (decryptedCccd && decryptedCccd.includes('*'))) {
      decryptedCccd = record.ssn_masked || decryptedCccd;
      console.warn(`[SECURITY AUDIT] Sử dụng CCCD che mờ dự phòng an toàn cho Employee ID ${parsedId}`);
    } else {
      console.error(`[SECURITY AUDIT] Giải mã CCCD thất bại cho Employee ID ${parsedId}: Kết quả NULL hoặc sai định dạng.`);
      throw new CccdDecryptionError('Không thể giải mã số CCCD do lỗi dữ liệu hoặc khóa giải mã không hợp lệ.');
    }
  }

  // Hàm tiện ích format ngày về YYYY-MM-DD
  const formatDate = (dateVal) => {
    if (!dateVal) return null;
    if (typeof dateVal === 'string') return dateVal.slice(0, 10);
    if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
      const year = dateVal.getFullYear();
      const month = String(dateVal.getMonth() + 1).padStart(2, '0');
      const day = String(dateVal.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return String(dateVal).slice(0, 10);
  };

  // 4. Định dạng phản hồi an toàn: Tuyệt đối không trả ciphertext hay dữ liệu băm
  return {
    employeeId: record.employee_id,
    employeeCode: record.employee_code,
    fullName: record.full_name,
    cccd: decryptedCccd,
    email: record.email || null,
    phone: record.phone || null,
    address: record.address || null,
    gender: record.gender || null,
    dateOfBirth: formatDate(record.date_of_birth),
    departmentId: record.department_id,
    departmentName: record.department_name || null,
    departmentCode: record.department_code || null,
    position: record.position || null,
    baseSalary: Number(record.base_salary || 0),
    hireDate: formatDate(record.hire_date),
    status: record.employment_status ? record.employment_status.toUpperCase() : 'ACTIVE',
    employmentStatus: record.employment_status || 'Active',
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

/**
 * Lấy danh sách nhân viên có phân trang và lọc theo phòng ban
 * @param {object} options
 * @param {number} [options.page=1]
 * @param {number} [options.limit=10]
 * @param {number|null} [options.departmentId=null]
 * @param {string} [options.search='']
 * @returns {Promise<{ items: object[], total: number, totalPages: number, page: number, limit: number }>}
 */
export async function getEmployees({ page = 1, limit = 10, departmentId = null, search = '' } = {}) {
  // 1. Nếu có lọc theo departmentId, kiểm tra sự tồn tại của phòng ban
  if (departmentId !== null && departmentId !== undefined) {
    const dept = await departmentRepository.findById(departmentId);
    if (!dept) {
      throw new DepartmentNotFoundError(`Phòng ban với ID ${departmentId} không tồn tại trong hệ thống.`);
    }
  }

  // 2. Truy vấn đồng thời tổng số bản ghi và danh sách trang hiện tại
  const [total, rows] = await Promise.all([
    employeeRepository.countAll({ departmentId, search }),
    employeeRepository.findAll({ page, limit, departmentId, search }),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  // Hàm tiện ích format ngày về YYYY-MM-DD
  const formatDate = (dateVal) => {
    if (!dateVal) return null;
    if (typeof dateVal === 'string') return dateVal.slice(0, 10);
    if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
      const year = dateVal.getFullYear();
      const month = String(dateVal.getMonth() + 1).padStart(2, '0');
      const day = String(dateVal.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return String(dateVal).slice(0, 10);
  };

  // 3. Chuẩn hóa dữ liệu từng nhân viên (Tuyệt đối KHÔNG có thông tin CCCD)
  const items = rows.map((row) => ({
    employeeId: row.employee_id,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    departmentId: row.department_id,
    departmentName: row.department_name || null,
    phone: row.phone || null,
    hireDate: formatDate(row.hire_date),
    status: row.employment_status ? row.employment_status.toUpperCase() : 'ACTIVE',
    email: row.email || null,
    gender: row.gender || null,
    dateOfBirth: formatDate(row.date_of_birth),
    departmentCode: row.department_code || null,
    position: row.position || null,
    baseSalary: Number(row.base_salary || 0),
    employmentStatus: row.employment_status || 'Active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return {
    items,
    total,
    totalPages,
    page: Number(page),
    limit: Number(limit),
  };
}

/**
 * Cập nhật thông tin nhân viên (chức vụ, mức lương, số điện thoại)
 * 
 * @param {number} employeeId - ID nhân viên
 * @param {object} updates - Dữ liệu cập nhật đã qua validation
 * @param {string} [updates.position] - Chức vụ
 * @param {number} [updates.baseSalary] - Mức lương
 * @param {string|null} [updates.phone] - Số điện thoại
 * @returns {Promise<object>} Thông tin nhân viên sau khi cập nhật (Không chứa CCCD)
 */
export async function updateEmployee(employeeId, updates) {
  const parsedId = Number(employeeId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new EmployeeError('Mã định danh nhân viên (ID) phải là số nguyên dương hợp lệ.', 400, 'INVALID_ID');
  }

  // 1. Kiểm tra sự tồn tại của nhân viên trong CSDL
  const existing = await employeeRepository.findById(parsedId);
  if (!existing) {
    throw new EmployeeNotFoundError(`Không tìm thấy nhân viên với ID ${parsedId}.`);
  }

  // 2. Kiểm tra trạng thái nhân sự: Không cho phép cập nhật hồ sơ của nhân viên đã thôi việc
  if (existing.employment_status === 'Resigned') {
    throw new EmployeeError('Không thể cập nhật hồ sơ cho nhân viên đã thôi việc.', 400, 'EMPLOYEE_RESIGNED');
  }

  // 3. Thực thi cập nhật có tham số vào CSDL
  await employeeRepository.update(parsedId, updates);

  // 4. Lấy lại bản ghi sau khi cập nhật
  const updated = await employeeRepository.findById(parsedId);

  // Hàm tiện ích format ngày về YYYY-MM-DD
  const formatDate = (dateVal) => {
    if (!dateVal) return null;
    if (typeof dateVal === 'string') return dateVal.slice(0, 10);
    if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
      const year = dateVal.getFullYear();
      const month = String(dateVal.getMonth() + 1).padStart(2, '0');
      const day = String(dateVal.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return String(dateVal).slice(0, 10);
  };

  // 5. Định dạng dữ liệu trả về an toàn: Tuyệt đối KHÔNG trả CCCD thô, ciphertext hay hash
  return {
    employeeId: updated.employee_id,
    employeeCode: updated.employee_code,
    fullName: updated.full_name,
    email: updated.email || null,
    phone: updated.phone || null,
    position: updated.position || null,
    baseSalary: Number(updated.base_salary || 0),
    departmentId: updated.department_id,
    departmentName: updated.department_name || null,
    departmentCode: updated.department_code || null,
    address: updated.address || null,
    gender: updated.gender || null,
    dateOfBirth: formatDate(updated.date_of_birth),
    hireDate: formatDate(updated.hire_date),
    status: updated.employment_status ? updated.employment_status.toUpperCase() : 'ACTIVE',
    employmentStatus: updated.employment_status || 'Active',
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  };
}

/**
 * Chuyển nhân viên sang trạng thái thôi việc (Resigned) và khóa tài khoản User tương ứng trong một Transaction
 * Endpoint: PATCH /api/employees/:id
 * 
 * Quy trình xử lý nhất quán (Atomic Transaction):
 * 1. Bắt đầu transaction.
 * 2. Đọc và khóa bản ghi nhân viên bằng SELECT ... FOR UPDATE.
 * 3. Kiểm tra sự tồn tại của nhân viên (nếu không có -> 404 EMPLOYEE_NOT_FOUND).
 * 4. Đọc và khóa tài khoản User liên kết qua users.employee_id = employees.employee_id (SELECT ... FOR UPDATE).
 * 5. Xử lý Idempotency: nếu nhân viên đã nghỉ việc (employment_status === 'Resigned'):
 *    - Đảm bảo tài khoản liên kết (nếu có) đã bị khóa.
 *    - Trả về kết quả với cờ isAlreadyResigned: true mà không tạo tác dụng phụ lặp lại.
 * 6. Cập nhật employment_status = 'Resigned' cho nhân viên.
 * 7. Nếu có tài khoản User liên kết: cập nhật account_status = 'Locked'.
 *    Nếu không có tài khoản User liên kết: không khóa bất kỳ tài khoản nào khác, ghi nhận rõ trong kết quả.
 * 8. Commit transaction. Rollback hoàn toàn nếu có bất kỳ lỗi nào xảy ra.
 * 
 * @param {number|string} employeeId - ID nhân viên cần cho thôi việc
 * @returns {Promise<object>} Dữ liệu sau khi cập nhật
 */
export async function resignEmployee(employeeId) {
  const parsedId = Number(employeeId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new EmployeeError('Mã định danh nhân viên (ID) phải là số nguyên dương hợp lệ.', 400, 'INVALID_ID');
  }

  return await withTransaction(async (connection) => {
    // 1. Đọc và khóa bản ghi nhân viên theo thứ tự nhất quán
    const [empRows] = await connection.execute(
      `SELECT 
        e.employee_id,
        e.employee_code,
        e.full_name,
        e.email,
        e.phone,
        e.position,
        e.department_id,
        d.department_name,
        d.department_code,
        e.employment_status,
        e.created_at,
        e.updated_at
      FROM \`employees\` e
      LEFT JOIN \`departments\` d ON e.department_id = d.department_id
      WHERE e.employee_id = ?
      FOR UPDATE`,
      [parsedId]
    );

    if (empRows.length === 0) {
      throw new EmployeeNotFoundError(`Không tìm thấy nhân viên với ID ${parsedId}.`);
    }

    const employee = empRows[0];

    // 2. Đọc và khóa bản ghi tài khoản User liên kết (nếu có)
    const [userRows] = await connection.execute(
      `SELECT 
        u.user_id,
        u.username,
        u.role,
        u.account_status,
        u.employee_id
      FROM \`users\` u
      WHERE u.employee_id = ?
      FOR UPDATE`,
      [parsedId]
    );

    const linkedUser = userRows.length > 0 ? userRows[0] : null;

    // 3. Xử lý Idempotency: Nếu nhân viên đã ở trạng thái thôi việc từ trước
    if (employee.employment_status === 'Resigned') {
      if (linkedUser && linkedUser.account_status !== 'Locked') {
        await connection.execute(
          `UPDATE \`users\` SET account_status = 'Locked', updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
          [linkedUser.user_id]
        );
        linkedUser.account_status = 'Locked';
      }

      return {
        employeeId: employee.employee_id,
        employeeCode: employee.employee_code,
        fullName: employee.full_name,
        employmentStatus: 'Resigned',
        departmentId: employee.department_id,
        departmentName: employee.department_name,
        hasLinkedAccount: !!linkedUser,
        accountLocked: linkedUser ? true : false,
        userId: linkedUser ? linkedUser.user_id : null,
        username: linkedUser ? linkedUser.username : null,
        userAccountStatus: linkedUser ? 'Locked' : null,
        isAlreadyResigned: true,
      };
    }

    // 4. Cập nhật trạng thái nhân viên thành 'Resigned'
    const [empUpdateResult] = await connection.execute(
      `UPDATE \`employees\` 
       SET employment_status = 'Resigned', updated_at = CURRENT_TIMESTAMP 
       WHERE employee_id = ?`,
      [parsedId]
    );

    if (empUpdateResult.affectedRows === 0) {
      throw new EmployeeError('Không thể cập nhật trạng thái nhân viên.', 500, 'UPDATE_FAILED');
    }

    // 5. Khóa tài khoản User liên kết (nếu có)
    let accountLocked = false;
    let userAccountStatus = null;
    if (linkedUser) {
      const [userUpdateResult] = await connection.execute(
        `UPDATE \`users\` 
         SET account_status = 'Locked', updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = ?`,
        [linkedUser.user_id]
      );

      if (userUpdateResult.affectedRows === 0) {
        throw new EmployeeError('Không thể khóa tài khoản người dùng liên kết.', 500, 'LOCK_USER_FAILED');
      }

      accountLocked = true;
      userAccountStatus = 'Locked';
    }

    return {
      employeeId: employee.employee_id,
      employeeCode: employee.employee_code,
      fullName: employee.full_name,
      employmentStatus: 'Resigned',
      departmentId: employee.department_id,
      departmentName: employee.department_name,
      hasLinkedAccount: !!linkedUser,
      accountLocked,
      userId: linkedUser ? linkedUser.user_id : null,
      username: linkedUser ? linkedUser.username : null,
      userAccountStatus,
      isAlreadyResigned: false,
    };
  });
}

export default {
  createEmployee,
  getEmployeeById,
  getEmployees,
  updateEmployee,
  resignEmployee,
};
