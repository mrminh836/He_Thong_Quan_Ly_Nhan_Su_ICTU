import employeeService, { EmployeeError } from '../services/employeeService.js';
import {
  validateCreateEmployee,
  validateEmployeeQueryParams,
  validateEmployeeId,
  validateUpdateEmployee,
  validateResignEmployee,
} from '../validators/employeeValidator.js';
import { successResponse, errorResponse } from '../utils/response.js';

/**
 * Controller thêm mới nhân sự vào hệ thống HRM
 * Endpoint: POST /api/employees
 * Phân quyền: ADMIN, HR_MANAGER
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function createEmployee(req, res, next) {
  try {
    // 1. Kiểm tra tính hợp lệ của dữ liệu đầu vào (Input Validation)
    const validation = validateCreateEmployee(req.body);
    if (!validation.isValid) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'VALIDATION_ERROR',
        message: validation.error,
      });
    }

    // 2. Gọi tầng nghiệp vụ để mã hóa CCCD bằng AES_ENCRYPT và lưu CSDL
    const newEmployee = await employeeService.createEmployee(validation.data);

    // 3. Phản hồi thành công HTTP 201 Created
    return successResponse(res, {
      statusCode: 201,
      message: 'Thêm nhân viên thành công',
      data: newEmployee,
    });
  } catch (error) {
    // Bắt lỗi nghiệp vụ đã định nghĩa từ service
    if (error instanceof EmployeeError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
      });
    }

    // Bắt lỗi vi phạm ràng buộc duy nhất từ MySQL (Race conditions)
    if (error.code === 'ER_DUP_ENTRY') {
      const msg = error.message || '';
      if (msg.includes('uk_employees_code')) {
        return errorResponse(res, {
          statusCode: 409,
          errorCode: 'DUPLICATE_EMPLOYEE_CODE',
          message: 'Mã nhân viên đã tồn tại trong hệ thống.',
        });
      }
      if (msg.includes('uk_employees_ssn_hash')) {
        return errorResponse(res, {
          statusCode: 409,
          errorCode: 'DUPLICATE_CCCD',
          message: 'Số CCCD/CMND đã tồn tại trong hệ thống. Vui lòng kiểm tra lại.',
        });
      }
      if (msg.includes('uk_employees_email')) {
        return errorResponse(res, {
          statusCode: 409,
          errorCode: 'DUPLICATE_EMAIL',
          message: 'Địa chỉ email đã được sử dụng bởi nhân viên khác.',
        });
      }

      return errorResponse(res, {
        statusCode: 409,
        errorCode: 'DUPLICATE_ENTRY',
        message: 'Dữ liệu nhân sự bị trùng lặp với bản ghi đã có trong hệ thống.',
      });
    }

    // Lỗi hệ thống ngoài dự kiến -> chuyển qua errorHandler middleware (không để lộ SQL)
    next(error);
  }
}

/**
 * Controller xem thông tin chi tiết một nhân viên và giải mã CCCD bằng AES_DECRYPT
 * Endpoint: GET /api/employees/:id
 * Phân quyền: ADMIN, HR_MANAGER
 */
export async function getEmployeeById(req, res, next) {
  try {
    const rawId = req.params.id;
    if (!rawId || !/^\d+$/.test(String(rawId).trim())) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'INVALID_ID',
        message: 'Mã định danh nhân viên (ID) phải là số nguyên dương hợp lệ.',
      });
    }

    const employeeId = Number(rawId);
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'INVALID_ID',
        message: 'Mã định danh nhân viên (ID) phải là số nguyên dương hợp lệ.',
      });
    }

    const employee = await employeeService.getEmployeeById(employeeId);

    return successResponse(res, {
      statusCode: 200,
      message: 'Lấy chi tiết nhân viên thành công',
      data: employee,
    });
  } catch (error) {
    if (error instanceof EmployeeError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
      });
    }
    next(error);
  }
}

/**
 * Controller lấy danh sách nhân viên có phân trang và lọc theo phòng ban
 * Endpoint: GET /api/employees
 * Phân quyền: ADMIN, HR_MANAGER
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function getEmployees(req, res, next) {
  try {
    const queryValidation = validateEmployeeQueryParams(req.query);
    if (!queryValidation.isValid) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'VALIDATION_ERROR',
        message: queryValidation.error,
      });
    }

    const result = await employeeService.getEmployees(queryValidation.data);

    return successResponse(res, {
      statusCode: 200,
      message: 'Lấy danh sách nhân viên thành công',
      data: result.items,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    if (error instanceof EmployeeError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
      });
    }
    next(error);
  }
}

/**
 * Controller cập nhật thông tin nhân viên (Chức vụ, Mức lương, Số điện thoại)
 * Endpoint: PUT /api/employees/:id
 * Phân quyền: ADMIN, HR_MANAGER
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function updateEmployee(req, res, next) {
  try {
    // 1. Kiểm tra ID từ URL
    const idValidation = validateEmployeeId(req.params.id);
    if (!idValidation.isValid) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'INVALID_ID',
        message: idValidation.error,
      });
    }

    // 2. Kiểm tra dữ liệu đầu vào (Input Validation)
    const bodyValidation = validateUpdateEmployee(req.body);
    if (!bodyValidation.isValid) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'VALIDATION_ERROR',
        message: bodyValidation.error,
        errors: bodyValidation.errors || undefined,
      });
    }

    // 3. Thực hiện cập nhật thông tin nhân viên
    const updatedEmployee = await employeeService.updateEmployee(
      idValidation.parsedId,
      bodyValidation.updates
    );

    // 4. Phản hồi thành công HTTP 200 OK
    return successResponse(res, {
      statusCode: 200,
      message: 'Cập nhật thông tin nhân viên thành công',
      data: updatedEmployee,
    });
  } catch (error) {
    if (error instanceof EmployeeError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
      });
    }

    next(error);
  }
}

/**
 * Controller cho nhân viên nghỉ việc và khóa tài khoản người dùng tương ứng
 * Endpoint: PATCH /api/employees/:id
 * Phân quyền: ADMIN, HR_MANAGER
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function resignEmployee(req, res, next) {
  try {
    // 1. Kiểm tra ID từ URL
    const idValidation = validateEmployeeId(req.params.id);
    if (!idValidation.isValid) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'INVALID_ID',
        message: idValidation.error,
      });
    }

    // 2. Kiểm tra hành động action trong Request Body
    const bodyValidation = validateResignEmployee(req.body);
    if (!bodyValidation.isValid) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'VALIDATION_ERROR',
        message: bodyValidation.error,
      });
    }

    // 3. Thực thi nghiệp vụ thôi việc & khóa tài khoản trong Transaction MySQL
    const result = await employeeService.resignEmployee(idValidation.parsedId);

    // 4. Xác định thông điệp phản hồi
    let message = 'Đã chuyển nhân viên sang trạng thái nghỉ việc và khóa tài khoản';
    if (result.isAlreadyResigned) {
      message = 'Nhân viên đã ở trạng thái nghỉ việc trước đó.';
    } else if (!result.hasLinkedAccount) {
      message = 'Đã chuyển nhân viên sang trạng thái nghỉ việc (nhân viên không có tài khoản User liên kết)';
    }

    // 5. Phản hồi thành công HTTP 200 OK
    return successResponse(res, {
      statusCode: 200,
      message,
      data: {
        employeeId: result.employeeId,
        employeeCode: result.employeeCode,
        fullName: result.fullName,
        employmentStatus: result.employmentStatus,
        hasLinkedAccount: result.hasLinkedAccount,
        accountLocked: result.accountLocked,
        userId: result.userId,
        username: result.username,
        userAccountStatus: result.userAccountStatus,
        isAlreadyResigned: result.isAlreadyResigned,
      },
    });
  } catch (error) {
    if (error instanceof EmployeeError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
      });
    }

    next(error);
  }
}

export default {
  createEmployee,
  getEmployeeById,
  getEmployees,
  updateEmployee,
  resignEmployee,
};
