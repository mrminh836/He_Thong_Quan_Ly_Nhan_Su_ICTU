import employeeRepository from '../repositories/employeeRepository.js';
import departmentRepository from '../repositories/departmentRepository.js';
import { maskCccd, computeCccdHmac, normalizeCccd } from '../utils/cccdSecurity.js';
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
 * Lấy thông tin chi tiết một nhân viên theo ID
 * @param {number} employeeId
 * @returns {Promise<object>}
 */
export async function getEmployeeById(employeeId) {
  if (!employeeId) {
    throw new EmployeeError('ID nhân sự là bắt buộc.', 400, 'INVALID_ID');
  }

  const record = await employeeRepository.findById(employeeId);
  if (!record) {
    throw new EmployeeError(`Không tìm thấy nhân sự với ID ${employeeId}.`, 404, 'EMPLOYEE_NOT_FOUND');
  }

  return {
    employeeId: record.employee_id,
    employeeCode: record.employee_code,
    fullName: record.full_name,
    email: record.email,
    phone: record.phone,
    address: record.address,
    gender: record.gender,
    dateOfBirth: record.date_of_birth,
    ssnMasked: record.ssn_masked,
    departmentId: record.department_id,
    departmentName: record.department_name,
    departmentCode: record.department_code,
    position: record.position,
    baseSalary: Number(record.base_salary || 0),
    hireDate: record.hire_date,
    employmentStatus: record.employment_status,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export default {
  createEmployee,
  getEmployeeById,
};
