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
 */
export async function deleteDepartment(departmentId, { isSoftDelete = false } = {}) {
  // 1. Kiểm tra tồn tại
  const existing = await departmentRepository.findById(departmentId);
  if (!existing) {
    throw new DepartmentError(
      `Không tìm thấy phòng ban với mã định danh ID: ${departmentId}.`,
      404,
      'DEPARTMENT_NOT_FOUND'
    );
  }

  // 2. Kiểm tra ràng buộc nhân sự (Foreign Key Check)
  const employeeCount = await departmentRepository.countEmployeesByDepartmentId(departmentId);
  if (employeeCount > 0) {
    throw new DepartmentError(
      `Không thể xóa phòng ban '${existing.departmentName}' vì hiện đang có ${employeeCount} nhân sự trực thuộc. Vui lòng điều chuyển nhân sự sang phòng ban khác trước khi thực hiện xóa.`,
      409,
      'DEPARTMENT_HAS_EMPLOYEES'
    );
  }

  // 3. Xóa vật lý hoặc xóa mềm tùy cấu hình
  if (isSoftDelete) {
    await departmentRepository.softDeleteById(departmentId);
    return {
      success: true,
      departmentId,
      departmentName: existing.departmentName,
      type: 'SOFT_DELETE',
      message: `Đã tạm ngưng hoạt động phòng ban '${existing.departmentName}' thành công.`,
    };
  }

  await departmentRepository.deleteById(departmentId);
  return {
    success: true,
    departmentId,
    departmentName: existing.departmentName,
    type: 'HARD_DELETE',
    message: `Đã xóa vĩnh viễn phòng ban '${existing.departmentName}' thành công.`,
  };
}

/**
 * Thống kê số lượng nhân viên hiện tại của từng phòng ban
 * Tổng hợp thông tin chi tiết và tóm tắt tổng số nhân viên toàn công ty
 */
export async function getDepartmentStatistics(options = {}) {
  const departments = await departmentRepository.getDepartmentEmployeeStats(options);

  const totalEmployees = departments.reduce((acc, curr) => acc + curr.employeeCount, 0);
  const activeEmployees = departments.reduce((acc, curr) => acc + curr.activeCount, 0);
  const onLeaveEmployees = departments.reduce((acc, curr) => acc + curr.onLeaveCount, 0);
  const totalDepartments = departments.length;
  const emptyDepartments = departments.filter((d) => d.employeeCount === 0).length;

  return {
    departments,
    summary: {
      totalDepartments,
      emptyDepartments,
      totalEmployees,
      activeEmployees,
      onLeaveEmployees,
    },
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
