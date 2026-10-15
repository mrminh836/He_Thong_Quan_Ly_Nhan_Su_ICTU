import employeeRepository from '../repositories/employeeRepository.js';
import departmentRepository from '../repositories/departmentRepository.js';
import { maskCccd, computeCccdHmac, normalizeCccd, validateCccdFormat } from '../utils/cccdSecurity.js';
import { env } from '../config/env.js';

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
  // Nếu MySQL trả về NULL (do sai khóa hoặc dữ liệu hỏng) hoặc chuỗi không đúng định dạng
  const decryptedCccd = record.cccd ? String(record.cccd).trim() : null;
  const cccdValidation = decryptedCccd ? validateCccdFormat(decryptedCccd) : { isValid: false };

  if (!decryptedCccd || !cccdValidation.isValid) {
    console.error(`[SECURITY AUDIT] Giải mã CCCD thất bại cho Employee ID ${parsedId}: Kết quả NULL hoặc sai định dạng.`);
    throw new CccdDecryptionError('Không thể giải mã số CCCD do lỗi dữ liệu hoặc khóa giải mã không hợp lệ.');
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

export default {
  createEmployee,
  getEmployeeById,
};
