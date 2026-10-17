import { validateCccdFormat } from '../utils/cccdSecurity.js';

/**
 * VALIDATOR: EMPLOYEE MODULE (Kiểm tra tính hợp lệ dữ liệu nhân viên)
 */

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_REGEX = /^[0-9+()\-.\s]{9,20}$/;
const CODE_REGEX = /^[A-Za-z0-9_-]{2,20}$/;

/**
 * Kiểm tra tính hợp lệ của chuỗi ngày theo định dạng YYYY-MM-DD
 * @param {string} dateStr 
 * @returns {boolean}
 */
function isValidDate(dateStr) {
  if (!DATE_REGEX.test(dateStr)) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime()) && dateStr === d.toISOString().split('T')[0];
}

/**
 * Xác thực dữ liệu đầu vào khi thêm mới nhân viên (POST /api/employees)
 * 
 * @param {object} body - Request body từ client
 * @returns {{ isValid: boolean, error?: string, data?: object }}
 */
export function validateCreateEmployee(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      error: 'Dữ liệu đầu vào phải là một đối tượng JSON hợp lệ.',
    };
  }

  // 1. Kiểm tra Họ và tên (Bắt buộc)
  const rawFullName = body.fullName || body.full_name;
  if (!rawFullName || typeof rawFullName !== 'string') {
    return {
      isValid: false,
      error: 'Họ và tên nhân viên là bắt buộc.',
    };
  }
  const fullName = rawFullName.trim();
  if (fullName.length < 2 || fullName.length > 100) {
    return {
      isValid: false,
      error: 'Họ và tên nhân viên phải có độ dài từ 2 đến 100 ký tự.',
    };
  }

  // 2. Kiểm tra Số CCCD / CMND (Bắt buộc)
  const rawCccd = body.cccd || body.ssn || body.ssnEncrypted;
  const cccdValidation = validateCccdFormat(rawCccd);
  if (!cccdValidation.isValid) {
    return {
      isValid: false,
      error: cccdValidation.error,
    };
  }

  // 3. Kiểm tra Phòng ban (Bắt buộc)
  const rawDeptId = body.departmentId || body.department_id;
  if (rawDeptId === undefined || rawDeptId === null || rawDeptId === '') {
    return {
      isValid: false,
      error: 'Phòng ban trực thuộc (departmentId) là bắt buộc.',
    };
  }
  const departmentId = Number(rawDeptId);
  if (!Number.isInteger(departmentId) || departmentId <= 0) {
    return {
      isValid: false,
      error: 'Mã phòng ban (departmentId) phải là số nguyên dương hợp lệ.',
    };
  }

  // 4. Kiểm tra Mã nhân viên (Tùy chọn, nếu truyền thì kiểm tra định dạng)
  let employeeCode = body.employeeCode || body.employee_code;
  if (employeeCode !== undefined && employeeCode !== null && String(employeeCode).trim() !== '') {
    employeeCode = String(employeeCode).trim().toUpperCase();
    if (!CODE_REGEX.test(employeeCode)) {
      return {
        isValid: false,
        error: 'Mã nhân viên phải có độ dài từ 2 đến 20 ký tự và chỉ chứa chữ cái, chữ số, dấu gạch nối (-) hoặc gạch dưới (_).',
      };
    }
  } else {
    employeeCode = null; // Sẽ được service tự động sinh (vd: NV006)
  }

  // 5. Kiểm tra Số điện thoại (Tùy chọn)
  let phone = body.phone;
  if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
    phone = String(phone).trim();
    if (!PHONE_REGEX.test(phone)) {
      return {
        isValid: false,
        error: 'Số điện thoại không đúng định dạng.',
      };
    }
  } else {
    phone = null;
  }

  // 6. Kiểm tra Email (Tùy chọn)
  let email = body.email;
  if (email !== undefined && email !== null && String(email).trim() !== '') {
    email = String(email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(email) || email.length > 100) {
      return {
        isValid: false,
        error: 'Địa chỉ email không đúng định dạng hợp lệ.',
      };
    }
  } else {
    email = null;
  }

  // 7. Kiểm tra Ngày vào làm (Hire Date - Tùy chọn, mặc định hôm nay)
  let hireDate = body.hireDate || body.hire_date;
  if (hireDate !== undefined && hireDate !== null && String(hireDate).trim() !== '') {
    hireDate = String(hireDate).trim();
    if (!isValidDate(hireDate)) {
      return {
        isValid: false,
        error: 'Ngày vào làm (hireDate) không đúng định dạng YYYY-MM-DD.',
      };
    }
  } else {
    hireDate = new Date().toISOString().split('T')[0];
  }

  // 8. Kiểm tra Ngày sinh (Date of Birth - Tùy chọn)
  let dateOfBirth = body.dateOfBirth || body.date_of_birth;
  if (dateOfBirth !== undefined && dateOfBirth !== null && String(dateOfBirth).trim() !== '') {
    dateOfBirth = String(dateOfBirth).trim();
    if (!isValidDate(dateOfBirth)) {
      return {
        isValid: false,
        error: 'Ngày sinh (dateOfBirth) không đúng định dạng YYYY-MM-DD.',
      };
    }
    const birthYear = new Date(dateOfBirth).getFullYear();
    const currentYear = new Date().getFullYear();
    if (birthYear > currentYear || currentYear - birthYear < 15) {
      return {
        isValid: false,
        error: 'Ngày sinh không hợp lý (nhân sự phải từ 15 tuổi trở lên).',
      };
    }
  } else {
    dateOfBirth = null;
  }

  // 9. Giới tính (Gender - Tùy chọn, mặc định 'Male')
  let gender = body.gender;
  const validGenders = ['Male', 'Female', 'Other'];
  if (gender !== undefined && gender !== null && String(gender).trim() !== '') {
    gender = String(gender).trim();
    const matched = validGenders.find((g) => g.toLowerCase() === gender.toLowerCase());
    if (!matched) {
      return {
        isValid: false,
        error: "Giới tính phải là 'Male', 'Female' hoặc 'Other'.",
      };
    }
    gender = matched;
  } else {
    gender = 'Male';
  }

  // 10. Chức vụ / Vị trí công tác (Position - Tùy chọn)
  let position = body.position;
  if (position !== undefined && position !== null && String(position).trim() !== '') {
    position = String(position).trim();
    if (position.length > 50) {
      return {
        isValid: false,
        error: 'Chức danh công tác không được vượt quá 50 ký tự.',
      };
    }
  } else {
    position = 'Nhân viên';
  }

  // 11. Mức lương cơ bản (Base Salary - Tùy chọn)
  let baseSalary = body.baseSalary || body.base_salary;
  if (baseSalary !== undefined && baseSalary !== null && baseSalary !== '') {
    baseSalary = Number(baseSalary);
    if (isNaN(baseSalary) || baseSalary < 0) {
      return {
        isValid: false,
        error: 'Mức lương cơ bản (baseSalary) phải là số không âm.',
      };
    }
  } else {
    baseSalary = 0.00;
  }

  // 12. Địa chỉ (Address - Tùy chọn)
  let address = body.address;
  if (address !== undefined && address !== null && String(address).trim() !== '') {
    address = String(address).trim();
    if (address.length > 255) {
      return {
        isValid: false,
        error: 'Địa chỉ không được vượt quá 255 ký tự.',
      };
    }
  } else {
    address = null;
  }

  // 13. Trạng thái làm việc (Employment Status - Tùy chọn)
  let employmentStatus = body.employmentStatus || body.employment_status || body.status;
  const validStatuses = ['Active', 'OnLeave', 'Resigned'];
  if (employmentStatus !== undefined && employmentStatus !== null && String(employmentStatus).trim() !== '') {
    employmentStatus = String(employmentStatus).trim();
    const matchedStatus = validStatuses.find((s) => s.toLowerCase() === employmentStatus.toLowerCase());
    if (!matchedStatus) {
      return {
        isValid: false,
        error: "Trạng thái nhân sự phải là 'Active', 'OnLeave' hoặc 'Resigned'.",
      };
    }
    employmentStatus = matchedStatus;
  } else {
    employmentStatus = 'Active';
  }

  return {
    isValid: true,
    data: {
      fullName,
      cccd: cccdValidation.normalizedCccd,
      departmentId,
      employeeCode,
      phone,
      email,
      hireDate,
      dateOfBirth,
      gender,
      position,
      baseSalary,
      address,
      employmentStatus,
    },
  };
}

/**
 * Kiểm tra và chuẩn hóa các tham số phân trang, tìm kiếm và lọc danh sách nhân viên
 * @param {object} query 
 * @returns {{ isValid: boolean, error?: string, data?: { page: number, limit: number, departmentId: number|null, search: string } }}
 */
export function validateEmployeeQueryParams(query = {}) {
  let page = 1;
  let limit = 10;
  let departmentId = null;
  let search = '';

  // 1. Kiểm tra page (Mặc định: 1)
  if (query.page !== undefined && query.page !== null && query.page !== '') {
    const rawPage = String(query.page).trim();
    if (!/^\d+$/.test(rawPage)) {
      return {
        isValid: false,
        error: 'Tham số page phải là số nguyên dương hợp lệ (>= 1).',
      };
    }
    page = parseInt(rawPage, 10);
    if (page <= 0 || !Number.isSafeInteger(page)) {
      return {
        isValid: false,
        error: 'Tham số page phải lớn hơn hoặc bằng 1.',
      };
    }
  }

  // 2. Kiểm tra limit (Mặc định: 10, tối đa: 100)
  if (query.limit !== undefined && query.limit !== null && query.limit !== '') {
    const rawLimit = String(query.limit).trim();
    if (!/^\d+$/.test(rawLimit)) {
      return {
        isValid: false,
        error: 'Tham số limit phải là số nguyên dương hợp lệ (từ 1 đến 100).',
      };
    }
    limit = parseInt(rawLimit, 10);
    if (limit <= 0 || limit > 100 || !Number.isSafeInteger(limit)) {
      return {
        isValid: false,
        error: 'Tham số limit phải nằm trong khoảng từ 1 đến 100.',
      };
    }
  }

  // 3. Kiểm tra departmentId (Tùy chọn)
  const rawDeptId = query.departmentId ?? query.department_id;
  if (rawDeptId !== undefined && rawDeptId !== null && rawDeptId !== '') {
    const strDeptId = String(rawDeptId).trim();
    if (!/^\d+$/.test(strDeptId)) {
      return {
        isValid: false,
        error: 'Mã phòng ban (departmentId) phải là số nguyên dương hợp lệ.',
      };
    }
    departmentId = parseInt(strDeptId, 10);
    if (departmentId <= 0 || !Number.isSafeInteger(departmentId)) {
      return {
        isValid: false,
        error: 'Mã phòng ban (departmentId) phải lớn hơn 0.',
      };
    }
  }

  // 4. Kiểm tra search (Tùy chọn)
  if (query.search !== undefined && query.search !== null) {
    if (typeof query.search !== 'string') {
      return {
        isValid: false,
        error: 'Từ khóa tìm kiếm (search) phải là chuỗi ký tự.',
      };
    }
    search = query.search.trim();
    if (search.length > 100) {
      return {
        isValid: false,
        error: 'Từ khóa tìm kiếm không được vượt quá 100 ký tự.',
      };
    }
  }

  return {
    isValid: true,
    data: {
      page,
      limit,
      departmentId,
      search,
    },
  };
}

/**
 * Kiểm tra tính hợp lệ của Employee ID từ URL params
 * @param {any} rawId 
 * @returns {{ isValid: boolean, error?: string, parsedId?: number }}
 */
export function validateEmployeeId(rawId) {
  if (rawId === undefined || rawId === null || String(rawId).trim() === '') {
    return {
      isValid: false,
      error: 'Mã định danh nhân viên (ID) là bắt buộc.',
    };
  }

  const strId = String(rawId).trim();
  if (!/^\d+$/.test(strId)) {
    return {
      isValid: false,
      error: 'Mã định danh nhân viên (ID) phải là số nguyên dương hợp lệ.',
    };
  }

  const parsedId = Number(strId);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0) {
    return {
      isValid: false,
      error: 'Mã định danh nhân viên (ID) phải là số nguyên dương lớn hơn 0.',
    };
  }

  return {
    isValid: true,
    parsedId,
  };
}

/**
 * Kiểm tra và chuẩn hóa dữ liệu khi cập nhật nhân viên (PUT /api/employees/:id)
 * Chỉ cho phép cập nhật 3 trường nghiệp vụ:
 * 1. position / Position
 * 2. salary / Salary / baseSalary / base_salary
 * 3. phone / Phone
 * 
 * @param {object} body - Request body từ client
 * @returns {{ isValid: boolean, error?: string, errors?: Record<string, string>, updates?: object }}
 */
export function validateUpdateEmployee(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      error: 'Dữ liệu đầu vào phải là một đối tượng JSON hợp lệ.',
    };
  }

  const updates = {};
  const errors = {};
  let fieldCount = 0;

  // 1. Kiểm tra Chức vụ (position / Position)
  const rawPosition = body.position ?? body.Position;
  if (rawPosition !== undefined) {
    if (typeof rawPosition !== 'string') {
      errors.position = 'Chức vụ phải là chuỗi ký tự.';
    } else {
      const cleanPosition = rawPosition.trim();
      if (cleanPosition.length === 0) {
        errors.position = 'Chức vụ không được để trống hoặc chỉ chứa khoảng trắng.';
      } else if (cleanPosition.length > 50) {
        errors.position = 'Chức vụ không được vượt quá 50 ký tự.';
      } else {
        updates.position = cleanPosition;
        fieldCount++;
      }
    }
  }

  // 2. Kiểm tra Mức lương (salary / Salary / baseSalary / base_salary)
  const rawSalary = body.salary ?? body.Salary ?? body.baseSalary ?? body.base_salary;
  if (rawSalary !== undefined) {
    if (rawSalary === null || rawSalary === '' || typeof rawSalary === 'boolean') {
      errors.salary = 'Mức lương phải là số không âm hợp lệ.';
    } else {
      const numSalary = typeof rawSalary === 'number' ? rawSalary : Number(String(rawSalary).trim());
      if (isNaN(numSalary) || !isFinite(numSalary)) {
        errors.salary = 'Mức lương phải là số không âm hợp lệ.';
      } else if (numSalary < 0) {
        errors.salary = 'Mức lương không được là số âm.';
      } else if (numSalary > 9999999999.99) {
        errors.salary = 'Mức lương vượt quá giới hạn tối đa cho phép (tối đa 9,999,999,999.99 VNĐ).';
      } else {
        // Làm tròn tối đa 2 chữ số thập phân cho DECIMAL(12, 2)
        updates.baseSalary = Number(numSalary.toFixed(2));
        fieldCount++;
      }
    }
  }

  // 3. Kiểm tra Số điện thoại (phone / Phone)
  const rawPhone = body.phone ?? body.Phone;
  if (rawPhone !== undefined) {
    if (rawPhone === null || (typeof rawPhone === 'string' && rawPhone.trim() === '')) {
      updates.phone = null;
      fieldCount++;
    } else if (typeof rawPhone !== 'string' && typeof rawPhone !== 'number') {
      errors.phone = 'Số điện thoại không đúng định dạng.';
    } else {
      const cleanPhone = String(rawPhone).trim();
      if (cleanPhone.length > 20) {
        errors.phone = 'Số điện thoại không được vượt quá 20 ký tự.';
      } else if (!PHONE_REGEX.test(cleanPhone)) {
        errors.phone = 'Số điện thoại không đúng định dạng.';
      } else {
        updates.phone = cleanPhone;
        fieldCount++;
      }
    }
  }

  // Nếu có lỗi validation ở bất kỳ trường nào
  const errorKeys = Object.keys(errors);
  if (errorKeys.length > 0) {
    return {
      isValid: false,
      error: errors[errorKeys[0]],
      errors,
    };
  }

  // Nếu không có trường nào hợp lệ để cập nhật
  if (fieldCount === 0) {
    return {
      isValid: false,
      error: 'Vui lòng cung cấp ít nhất một trường thông tin hợp lệ để cập nhật (chức vụ, mức lương, số điện thoại).',
    };
  }

  return {
    isValid: true,
    updates,
  };
}

/**
 * Xác thực dữ liệu đầu vào khi cho nhân viên nghỉ việc (PATCH /api/employees/:id)
 * Chỉ chấp nhận action: 'RESIGN'
 * 
 * @param {object} body - Request body từ client
 * @returns {{ isValid: boolean, error?: string, action?: string }}
 */
export function validateResignEmployee(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      error: 'Dữ liệu đầu vào phải là một đối tượng JSON hợp lệ.',
    };
  }

  const action = body.action ?? body.Action;
  if (!action || typeof action !== 'string') {
    return {
      isValid: false,
      error: 'Hành động (action) là bắt buộc và phải là chuỗi ký tự.',
    };
  }

  const cleanAction = action.trim().toUpperCase();
  if (cleanAction !== 'RESIGN') {
    return {
      isValid: false,
      error: 'Hành động (action) không hợp lệ. Chỉ chấp nhận hành động "RESIGN".',
    };
  }

  // Chống client gửi các trường nội bộ khác (role, account_status, employment_status, etc.)
  const allowedKeys = ['action', 'Action'];
  const disallowedKeys = Object.keys(body).filter((k) => !allowedKeys.includes(k));
  if (disallowedKeys.length > 0) {
    return {
      isValid: false,
      error: `Không được phép gửi kèm các trường ngoài hành động: ${disallowedKeys.join(', ')}.`,
    };
  }

  return {
    isValid: true,
    action: cleanAction,
  };
}

export default {
  validateCreateEmployee,
  validateEmployeeQueryParams,
  validateEmployeeId,
  validateUpdateEmployee,
  validateResignEmployee,
};
