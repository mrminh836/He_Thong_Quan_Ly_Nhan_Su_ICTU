/**
 * VALIDATOR: Xác thực dữ liệu đầu vào cho Department API
 */

/**
 * Kiểm tra ID trên URL param có phải là số nguyên dương hợp lệ
 * @param {any} id 
 * @returns {{ isValid: boolean, error?: string, parsedId?: number }}
 */
export function validateDepartmentId(id) {
  if (id === undefined || id === null || id === '') {
    return { isValid: false, error: 'Mã định danh phòng ban (ID) là bắt buộc.' };
  }

  const str = String(id).trim();
  if (!/^\d+$/.test(str)) {
    return { isValid: false, error: 'Mã phòng ban phải là số nguyên dương hợp lệ.' };
  }

  const parsed = parseInt(str, 10);
  if (parsed <= 0 || !Number.isSafeInteger(parsed)) {
    return { isValid: false, error: 'Mã phòng ban phải lớn hơn 0.' };
  }

  return { isValid: true, parsedId: parsed };
}

/**
 * Kiểm tra dữ liệu khi tạo mới phòng ban
 * @param {object} body 
 * @returns {{ isValid: boolean, error?: string, data?: object }}
 */
export function validateCreateDepartment(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { isValid: false, error: 'Dữ liệu yêu cầu không hợp lệ. Vui lòng gửi JSON object.' };
  }

  // Hỗ trợ cả camelCase và snake_case
  const rawName = body.departmentName ?? body.department_name;
  const rawCode = body.departmentCode ?? body.department_code;
  const rawLocation = body.location;
  const rawPhone = body.phone;
  const rawDescription = body.description;
  const rawIsActive = body.isActive ?? body.is_active;

  // 1. Kiểm tra departmentName (Bắt buộc)
  if (rawName === undefined || rawName === null) {
    return { isValid: false, error: 'Tên phòng ban (departmentName) là bắt buộc.' };
  }

  if (typeof rawName !== 'string') {
    return { isValid: false, error: 'Tên phòng ban phải là chuỗi ký tự.' };
  }

  const cleanName = rawName.trim();
  if (cleanName.length === 0) {
    return { isValid: false, error: 'Tên phòng ban không được để trống hoặc chỉ chứa khoảng trắng.' };
  }

  if (cleanName.length > 100) {
    return { isValid: false, error: 'Tên phòng ban không được vượt quá 100 ký tự.' };
  }

  // 2. Kiểm tra departmentCode (Tùy chọn, nếu có thì phải đúng format)
  let cleanCode = null;
  if (rawCode !== undefined && rawCode !== null && String(rawCode).trim() !== '') {
    if (typeof rawCode !== 'string') {
      return { isValid: false, error: 'Mã phòng ban phải là chuỗi ký tự.' };
    }
    cleanCode = rawCode.trim().toUpperCase();
    if (cleanCode.length < 2 || cleanCode.length > 20) {
      return { isValid: false, error: 'Mã phòng ban phải có độ dài từ 2 đến 20 ký tự.' };
    }
    if (!/^[A-Z0-9_-]+$/.test(cleanCode)) {
      return { isValid: false, error: 'Mã phòng ban chỉ được chứa chữ cái, chữ số, dấu gạch nối (-) hoặc gạch dưới (_).' };
    }
  }

  // 3. Kiểm tra location (Tùy chọn)
  let cleanLocation = null;
  if (rawLocation !== undefined && rawLocation !== null) {
    if (typeof rawLocation !== 'string') {
      return { isValid: false, error: 'Địa điểm làm việc phải là chuỗi ký tự.' };
    }
    cleanLocation = rawLocation.trim();
    if (cleanLocation.length > 255) {
      return { isValid: false, error: 'Địa điểm làm việc không được vượt quá 255 ký tự.' };
    }
  }

  // 4. Kiểm tra phone (Tùy chọn)
  let cleanPhone = null;
  if (rawPhone !== undefined && rawPhone !== null) {
    if (typeof rawPhone !== 'string') {
      return { isValid: false, error: 'Số điện thoại phải là chuỗi ký tự.' };
    }
    cleanPhone = rawPhone.trim();
    if (cleanPhone.length > 20) {
      return { isValid: false, error: 'Số điện thoại không được vượt quá 20 ký tự.' };
    }
    if (cleanPhone.length > 0 && !/^[0-9+\s\-().]+$/.test(cleanPhone)) {
      return { isValid: false, error: 'Số điện thoại chứa ký tự không hợp lệ.' };
    }
  }

  // 5. Kiểm tra description (Tùy chọn)
  let cleanDescription = null;
  if (rawDescription !== undefined && rawDescription !== null) {
    if (typeof rawDescription !== 'string') {
      return { isValid: false, error: 'Mô tả phòng ban phải là chuỗi ký tự.' };
    }
    cleanDescription = rawDescription.trim();
  }

  // 6. Kiểm tra isActive (Tùy chọn, mặc định true)
  let isActive = true;
  if (rawIsActive !== undefined) {
    if (typeof rawIsActive === 'boolean') {
      isActive = rawIsActive;
    } else if (rawIsActive === 'true' || rawIsActive === 1 || rawIsActive === '1') {
      isActive = true;
    } else if (rawIsActive === 'false' || rawIsActive === 0 || rawIsActive === '0') {
      isActive = false;
    } else {
      return { isValid: false, error: 'Trạng thái hoạt động (isActive) phải là giá trị boolean.' };
    }
  }

  return {
    isValid: true,
    data: {
      departmentName: cleanName,
      departmentCode: cleanCode,
      location: cleanLocation,
      phone: cleanPhone,
      description: cleanDescription,
      isActive,
    },
  };
}

/**
 * Kiểm tra dữ liệu khi cập nhật phòng ban (PUT)
 * @param {object} body 
 * @returns {{ isValid: boolean, error?: string, updates?: object }}
 */
export function validateUpdateDepartment(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { isValid: false, error: 'Dữ liệu cập nhật không hợp lệ. Vui lòng gửi JSON object.' };
  }

  const updates = {};
  let fieldCount = 0;

  // 1. departmentName
  const rawName = body.departmentName ?? body.department_name;
  if (rawName !== undefined) {
    if (rawName === null || typeof rawName !== 'string') {
      return { isValid: false, error: 'Tên phòng ban phải là chuỗi ký tự.' };
    }
    const cleanName = rawName.trim();
    if (cleanName.length === 0) {
      return { isValid: false, error: 'Tên phòng ban không được để trống hoặc chỉ chứa khoảng trắng.' };
    }
    if (cleanName.length > 100) {
      return { isValid: false, error: 'Tên phòng ban không được vượt quá 100 ký tự.' };
    }
    updates.departmentName = cleanName;
    fieldCount++;
  }

  // 2. departmentCode
  const rawCode = body.departmentCode ?? body.department_code;
  if (rawCode !== undefined) {
    if (rawCode === null || typeof rawCode !== 'string') {
      return { isValid: false, error: 'Mã phòng ban phải là chuỗi ký tự.' };
    }
    const cleanCode = rawCode.trim().toUpperCase();
    if (cleanCode.length < 2 || cleanCode.length > 20) {
      return { isValid: false, error: 'Mã phòng ban phải có độ dài từ 2 đến 20 ký tự.' };
    }
    if (!/^[A-Z0-9_-]+$/.test(cleanCode)) {
      return { isValid: false, error: 'Mã phòng ban chỉ được chứa chữ cái, chữ số, dấu gạch nối (-) hoặc gạch dưới (_).' };
    }
    updates.departmentCode = cleanCode;
    fieldCount++;
  }

  // 3. location
  if (body.location !== undefined) {
    if (body.location === null) {
      updates.location = null;
    } else {
      if (typeof body.location !== 'string') {
        return { isValid: false, error: 'Địa điểm làm việc phải là chuỗi ký tự.' };
      }
      const cleanLoc = body.location.trim();
      if (cleanLoc.length > 255) {
        return { isValid: false, error: 'Địa điểm làm việc không được vượt quá 255 ký tự.' };
      }
      updates.location = cleanLoc;
    }
    fieldCount++;
  }

  // 4. phone
  if (body.phone !== undefined) {
    if (body.phone === null) {
      updates.phone = null;
    } else {
      if (typeof body.phone !== 'string') {
        return { isValid: false, error: 'Số điện thoại phải là chuỗi ký tự.' };
      }
      const cleanPhone = body.phone.trim();
      if (cleanPhone.length > 20) {
        return { isValid: false, error: 'Số điện thoại không được vượt quá 20 ký tự.' };
      }
      if (cleanPhone.length > 0 && !/^[0-9+\s\-().]+$/.test(cleanPhone)) {
        return { isValid: false, error: 'Số điện thoại chứa ký tự không hợp lệ.' };
      }
      updates.phone = cleanPhone;
    }
    fieldCount++;
  }

  // 5. description
  if (body.description !== undefined) {
    if (body.description === null) {
      updates.description = null;
    } else {
      if (typeof body.description !== 'string') {
        return { isValid: false, error: 'Mô tả phòng ban phải là chuỗi ký tự.' };
      }
      updates.description = body.description.trim();
    }
    fieldCount++;
  }

  // 6. isActive
  const rawIsActive = body.isActive ?? body.is_active;
  if (rawIsActive !== undefined) {
    if (typeof rawIsActive === 'boolean') {
      updates.isActive = rawIsActive;
    } else if (rawIsActive === 'true' || rawIsActive === 1 || rawIsActive === '1') {
      updates.isActive = true;
    } else if (rawIsActive === 'false' || rawIsActive === 0 || rawIsActive === '0') {
      updates.isActive = false;
    } else {
      return { isValid: false, error: 'Trạng thái hoạt động (isActive) phải là giá trị boolean.' };
    }
    fieldCount++;
  }

  if (fieldCount === 0) {
    return {
      isValid: false,
      error: 'Cần cung cấp ít nhất một trường dữ liệu hợp lệ để cập nhật (departmentName, departmentCode, location, phone, description, isActive).',
    };
  }

  return { isValid: true, updates };
}

/**
 * Kiểm tra và chuẩn hóa các tham số phân trang, tìm kiếm
 * @param {object} query 
 */
export function validateQueryParams(query = {}) {
  let page = 1;
  let limit = 10;

  if (query.page !== undefined) {
    const parsedPage = parseInt(query.page, 10);
    if (!isNaN(parsedPage) && parsedPage > 0) {
      page = parsedPage;
    }
  }

  if (query.limit !== undefined) {
    const parsedLimit = parseInt(query.limit, 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      limit = Math.min(100, parsedLimit);
    }
  }

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const sortBy = typeof query.sortBy === 'string' ? query.sortBy.trim() : 'department_id';
  const sortOrder = String(query.sortOrder || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  let isActive = null;
  const statusParam = (query.status || query.isActive || query.is_active || '').toLowerCase();
  if (statusParam === 'active' || statusParam === 'true' || statusParam === '1') {
    isActive = true;
  } else if (statusParam === 'inactive' || statusParam === 'false' || statusParam === '0') {
    isActive = false;
  }

  return {
    page,
    limit,
    search,
    sortBy,
    sortOrder,
    isActive,
  };
}

export default {
  validateDepartmentId,
  validateCreateDepartment,
  validateUpdateDepartment,
  validateQueryParams,
};
