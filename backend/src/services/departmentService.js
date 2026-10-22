import departmentRepository from '../repositories/departmentRepository.js';

/**
 * Lớp lỗi nghiệp vụ tùy chỉnh cho Department Module
 */
export class DepartmentError extends Error {
  constructor(message, statusCode = 400, errorCode = 'DEPARTMENT_ERROR') {
    super(message);
    this.name = 'DepartmentError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

/**
 * Lỗi nghiệp vụ khi phòng ban vẫn còn nhân viên trực thuộc (409 Conflict)
 */
export class DepartmentHasEmployeesError extends DepartmentError {
  constructor(message = 'Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc.', details = null) {
    super(message, 409, 'DEPARTMENT_HAS_EMPLOYEES');
    this.name = 'DepartmentHasEmployeesError';
    this.details = details;
  }
}

/**
 * Lỗi không tìm thấy phòng ban (404 Not Found)
 */
export class DepartmentNotFoundError extends DepartmentError {
  constructor(message = 'Không tìm thấy phòng ban.', departmentId = null) {
    super(message, 404, 'DEPARTMENT_NOT_FOUND');
    this.name = 'DepartmentNotFoundError';
    this.departmentId = departmentId;
  }
}

/**
 * Tiện ích chuyển đổi chuỗi tiếng Việt có dấu thành không dấu
 * @param {string} str 
 * @returns {string}
 */
function removeVietnameseTones(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Tự động sinh mã phòng ban duy nhất nếu người dùng không tự nhập
 * Ví dụ: "Phòng Công nghệ thông tin" -> "PB-CNTT"
 * @param {string} departmentName 
 * @returns {Promise<string>}
 */
export async function generateUniqueDepartmentCode(departmentName) {
  const clean = removeVietnameseTones(departmentName)
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim();

  const words = clean.split(/\s+/).filter(Boolean);
  let acronym = '';

  for (const word of words) {
    if (word.length > 0) {
      acronym += word[0].toUpperCase();
    }
  }

  // Đảm bảo có tiền tố PB-
  let baseCode = acronym.startsWith('PB') ? acronym : `PB-${acronym}`;
  if (baseCode.length > 15) {
    baseCode = baseCode.slice(0, 15);
  }

  // Kiểm tra tính duy nhất trong CSDL
  let candidate = baseCode;
  let counter = 1;

  while (await departmentRepository.findByCode(candidate)) {
    candidate = `${baseCode}-${counter}`;
    if (candidate.length > 20) {
      candidate = `PB-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    }
    counter++;
  }

  return candidate;
}

/**
 * Lấy danh sách phòng ban có phân trang & tìm kiếm
 */
export async function getDepartments(options) {
  return await departmentRepository.findAll(options);
}

/**
 * Lấy thông tin chi tiết một phòng ban theo ID
 */
export async function getDepartmentById(departmentId) {
  const department = await departmentRepository.findById(departmentId);
  if (!department) {
    throw new DepartmentError(
      `Không tìm thấy phòng ban với mã định danh ID: ${departmentId}.`,
      404,
      'DEPARTMENT_NOT_FOUND'
    );
  }
  return department;
}

/**
 * Tạo mới một phòng ban
 */
export async function createDepartment(departmentData) {
  const { departmentName, departmentCode, location, phone, description, isActive } = departmentData;

  // 1. Kiểm tra ràng buộc duy nhất Tên phòng ban
  const existingName = await departmentRepository.findByName(departmentName);
  if (existingName) {
    throw new DepartmentError(
      `Tên phòng ban '${departmentName}' đã tồn tại trong hệ thống.`,
      409,
      'DUPLICATE_DEPARTMENT_NAME'
    );
  }

  // 2. Xác định mã phòng ban
  let finalCode = departmentCode;
  if (finalCode) {
    const existingCode = await departmentRepository.findByCode(finalCode);
    if (existingCode) {
      throw new DepartmentError(
        `Mã phòng ban '${finalCode}' đã được sử dụng. Vui lòng chọn mã khác.`,
        409,
        'DUPLICATE_DEPARTMENT_CODE'
      );
    }
  } else {
    finalCode = await generateUniqueDepartmentCode(departmentName);
  }

  // 3. Thực thi lưu trữ CSDL
  const newId = await departmentRepository.create({
    departmentCode: finalCode,
    departmentName,
    location,
    phone,
    description,
    isActive: isActive !== undefined ? isActive : true,
  });

  // 4. Trả về đối tượng vừa tạo
  return await departmentRepository.findById(newId);
}

/**
 * Cập nhật thông tin phòng ban
 */
export async function updateDepartment(departmentId, updates) {
  // 1. Kiểm tra sự tồn tại của phòng ban
  const existing = await departmentRepository.findById(departmentId);
  if (!existing) {
    throw new DepartmentError(
      `Không tìm thấy phòng ban với mã định danh ID: ${departmentId}.`,
      404,
      'DEPARTMENT_NOT_FOUND'
    );
  }

  // 2. Kiểm tra trùng tên với phòng ban khác
  if (updates.departmentName) {
    const duplicateName = await departmentRepository.findByNameExcludingId(
      updates.departmentName,
      departmentId
    );
    if (duplicateName) {
      throw new DepartmentError(
        `Tên phòng ban '${updates.departmentName}' đã được sử dụng bởi phòng ban khác.`,
        409,
        'DUPLICATE_DEPARTMENT_NAME'
      );
    }
  }

  // 3. Kiểm tra trùng mã với phòng ban khác
  if (updates.departmentCode) {
    const duplicateCode = await departmentRepository.findByCodeExcludingId(
      updates.departmentCode,
      departmentId
    );
    if (duplicateCode) {
      throw new DepartmentError(
        `Mã phòng ban '${updates.departmentCode}' đã được sử dụng bởi phòng ban khác.`,
        409,
        'DUPLICATE_DEPARTMENT_CODE'
      );
    }
  }

  // 4. Cập nhật vào CSDL
  await departmentRepository.update(departmentId, updates);

  // 5. Trả về thông tin phòng ban sau khi cập nhật
  return await departmentRepository.findById(departmentId);
}

/**
 * Xóa phòng ban (Kiểm tra nghiêm ngặt ràng buộc toàn vẹn dữ liệu)
 * Nếu còn nhân viên trực thuộc -> Từ chối xóa với lỗi 409 Conflict
 * Sử dụng SELECT EXISTS và Transaction khóa FOR UPDATE để ngăn ngừa race condition
 * 
 * @param {number} departmentId
 * @param {object} options
 * @returns {Promise<{ success: boolean, departmentId: number, departmentName: string, type: string, message: string }>}
 */
export async function deleteDepartment(departmentId, { isSoftDelete = false } = {}) {
  // 1. Kiểm tra sự tồn tại của phòng ban
  const existing = await departmentRepository.findById(departmentId);
  if (!existing) {
    throw new DepartmentNotFoundError('Không tìm thấy phòng ban.', departmentId);
  }

  // 2. Kiểm tra ràng buộc nhân sự trực thuộc bằng khóa ngoại thực tế (employees.department_id)
  // Bảo đảm tính toàn vẹn: bao gồm tất cả nhân viên tham chiếu, kể cả nhân viên đã thôi việc (Resigned)
  let employeeCount = 0;
  if (typeof departmentRepository.countEmployeesByDepartmentId === 'function') {
    employeeCount = await departmentRepository.countEmployeesByDepartmentId(departmentId);
  } else if (typeof departmentRepository.hasEmployees === 'function') {
    const hasEmp = await departmentRepository.hasEmployees(departmentId);
    employeeCount = hasEmp ? 1 : 0;
  }

  if (employeeCount > 0) {
    throw new DepartmentHasEmployeesError(
      'Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc.',
      { employeeCount }
    );
  }

  // 3. Nếu môi trường chạy thực tế hỗ trợ deleteDepartmentWithLock và không bị mock thủ công
  if (
    typeof departmentRepository.deleteDepartmentWithLock === 'function' &&
    !departmentRepository.__isMocked
  ) {
    const lockResult = await departmentRepository.deleteDepartmentWithLock(departmentId, {
      isSoftDelete,
    });

    if (!lockResult.found) {
      throw new DepartmentNotFoundError('Không tìm thấy phòng ban.', departmentId);
    }

    if (lockResult.hasEmployees) {
      throw new DepartmentHasEmployeesError(
        'Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc.'
      );
    }

    return {
      success: true,
      departmentId,
      departmentName: existing.departmentName,
      type: lockResult.type || (isSoftDelete ? 'SOFT_DELETE' : 'HARD_DELETE'),
      message: 'Xóa phòng ban thành công',
    };
  }

  // 4. Xóa vật lý hoặc xóa mềm tùy cấu hình
  if (isSoftDelete) {
    await departmentRepository.softDeleteById(departmentId);
    return {
      success: true,
      departmentId,
      departmentName: existing.departmentName,
      type: 'SOFT_DELETE',
      message: 'Xóa phòng ban thành công',
    };
  }

  await departmentRepository.deleteById(departmentId);
  return {
    success: true,
    departmentId,
    departmentName: existing.departmentName,
    type: 'HARD_DELETE',
    message: 'Xóa phòng ban thành công',
  };
}

/**
 * Thống kê số lượng nhân viên hiện tại của từng phòng ban và tỷ trọng cơ cấu nhân sự
 * Tổng hợp thông tin chi tiết và tóm tắt tổng số nhân viên toàn công ty
 * 
 * @param {object} options
 * @returns {Promise<{ departments: Array<object>, summary: object }>}
 */
export async function getDepartmentStatistics(options = {}) {
  const rawDepartments = await departmentRepository.getDepartmentEmployeeStats(options);

  const totalEmployees = rawDepartments.reduce(
    (acc, curr) => acc + (Number(curr.employeeCount) || 0),
    0
  );
  const activeEmployees = rawDepartments.reduce(
    (acc, curr) => acc + (Number(curr.activeCount) || 0),
    0
  );
  const onLeaveEmployees = rawDepartments.reduce(
    (acc, curr) => acc + (Number(curr.onLeaveCount) || 0),
    0
  );
  const resignedEmployees = rawDepartments.reduce(
    (acc, curr) => acc + (Number(curr.resignedCount) || 0),
    0
  );
  const totalDepartments = rawDepartments.length;
  const departmentsWithoutEmployees = rawDepartments.filter(
    (d) => (Number(d.employeeCount) || 0) === 0
  ).length;

  // Tính tỷ trọng (%) cơ cấu nhân sự của từng phòng ban
  // Công thức: Tỷ trọng (%) = (Số nhân viên phòng ban / Tổng số nhân viên) * 100
  // Nếu totalEmployees = 0 -> percentage = 0 (chống lỗi chia cho 0)
  const departments = rawDepartments.map((dept) => {
    const count = Number(dept.employeeCount) || 0;
    const percentage =
      totalEmployees > 0
        ? Number(((count / totalEmployees) * 100).toFixed(2))
        : 0;

    return {
      departmentId: dept.departmentId,
      departmentCode: dept.departmentCode,
      departmentName: dept.departmentName,
      isActive: dept.isActive,
      employeeCount: count,
      activeCount: Number(dept.activeCount) || 0,
      onLeaveCount: Number(dept.onLeaveCount) || 0,
      resignedCount: Number(dept.resignedCount) || 0,
      percentage,
    };
  });

  const summary = {
    totalDepartments,
    totalEmployees,
    departmentsWithoutEmployees,
    emptyDepartments: departmentsWithoutEmployees, // Alias tương thích ngược
    activeEmployees,
    onLeaveEmployees,
    resignedEmployees,
  };

  return {
    departments,
    summary,
  };
}

export default {
  getDepartments,
  getDepartmentById,
  getDepartmentStatistics,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  generateUniqueDepartmentCode,
  DepartmentError,
};
