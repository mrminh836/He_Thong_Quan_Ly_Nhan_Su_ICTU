import departmentService, { DepartmentError } from '../services/departmentService.js';
import {
  validateDepartmentId,
  validateCreateDepartment,
  validateUpdateDepartment,
  validateQueryParams,
} from '../validators/departmentValidator.js';
import { successResponse, errorResponse } from '../utils/response.js';

/**
 * Controller xử lý danh sách phòng ban
 * Endpoint: GET /api/departments
 */
export async function getDepartments(req, res, next) {
  try {
    const queryOptions = validateQueryParams(req.query);
    const result = await departmentService.getDepartments(queryOptions);

    return successResponse(res, {
      statusCode: 200,
      message: 'Lấy danh sách phòng ban thành công',
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    if (error instanceof DepartmentError) {
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
 * Controller lấy thông tin chi tiết một phòng ban theo ID
 * Endpoint: GET /api/departments/:id
 */
export async function getDepartmentById(req, res, next) {
  try {
    const idValidation = validateDepartmentId(req.params.id);
    if (!idValidation.isValid) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'INVALID_ID',
        message: idValidation.error,
      });
    }

    const department = await departmentService.getDepartmentById(idValidation.parsedId);

    return successResponse(res, {
      statusCode: 200,
      message: 'Lấy thông tin chi tiết phòng ban thành công',
      data: department,
    });
  } catch (error) {
    if (error instanceof DepartmentError) {
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
 * Controller tạo mới phòng ban
 * Endpoint: POST /api/departments
 */
export async function createDepartment(req, res, next) {
  try {
    const bodyValidation = validateCreateDepartment(req.body);
    if (!bodyValidation.isValid) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'VALIDATION_ERROR',
        message: bodyValidation.error,
      });
    }

    const newDepartment = await departmentService.createDepartment(bodyValidation.data);

    return successResponse(res, {
      statusCode: 201,
      message: 'Tạo phòng ban mới thành công',
      data: newDepartment,
    });
  } catch (error) {
    if (error instanceof DepartmentError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
      });
    }

    // Xử lý mã lỗi MySQL cơ bản nếu rơi vào race condition
    if (error.code === 'ER_DUP_ENTRY') {
      return errorResponse(res, {
        statusCode: 409,
        errorCode: 'DUPLICATE_ENTRY',
        message: 'Tên hoặc mã phòng ban đã tồn tại trong cơ sở dữ liệu.',
      });
    }

    next(error);
  }
}

/**
 * Controller cập nhật thông tin phòng ban
 * Endpoint: PUT /api/departments/:id
 */
export async function updateDepartment(req, res, next) {
  try {
    const idValidation = validateDepartmentId(req.params.id);
    if (!idValidation.isValid) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'INVALID_ID',
        message: idValidation.error,
      });
    }

    const bodyValidation = validateUpdateDepartment(req.body);
    if (!bodyValidation.isValid) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'VALIDATION_ERROR',
        message: bodyValidation.error,
      });
    }

    const updated = await departmentService.updateDepartment(
      idValidation.parsedId,
      bodyValidation.updates
    );

    return successResponse(res, {
      statusCode: 200,
      message: 'Cập nhật phòng ban thành công',
      data: updated,
    });
  } catch (error) {
    if (error instanceof DepartmentError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
      });
    }

    if (error.code === 'ER_DUP_ENTRY') {
      return errorResponse(res, {
        statusCode: 409,
        errorCode: 'DUPLICATE_ENTRY',
        message: 'Tên hoặc mã phòng ban cập nhật bị trùng với phòng ban khác.',
      });
    }

    next(error);
  }
}

/**
 * Controller xóa phòng ban
 * Endpoint: DELETE /api/departments/:id
 */
export async function deleteDepartment(req, res, next) {
  try {
    const idValidation = validateDepartmentId(req.params.id);
    if (!idValidation.isValid) {
      return errorResponse(res, {
        statusCode: 400,
        errorCode: 'INVALID_ID',
        message: idValidation.error,
      });
    }

    const isSoftDelete = req.query.soft === 'true' || req.query.soft === '1';
    const deleteResult = await departmentService.deleteDepartment(idValidation.parsedId, {
      isSoftDelete,
    });

    return successResponse(res, {
      statusCode: 200,
      message: deleteResult.message,
      data: deleteResult,
    });
  } catch (error) {
    if (error instanceof DepartmentError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
      });
    }

    // Xử lý mã lỗi ràng buộc khóa ngoại MySQL
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) {
      return errorResponse(res, {
        statusCode: 409,
        errorCode: 'FOREIGN_KEY_RESTRICTION',
        message: 'Không thể xóa phòng ban đang có nhân viên trực thuộc trong hệ thống.',
      });
    }

    next(error);
  }
}

/**
 * Controller thống kê số lượng nhân viên hiện tại theo từng phòng ban
 * Endpoint: GET /api/departments/statistics
 */
export async function getDepartmentStatistics(req, res, next) {
  try {
    const { status, sortBy, sortOrder } = req.query || {};
    const result = await departmentService.getDepartmentStatistics({
      departmentStatus: status,
      sortBy,
      sortOrder,
    });

    return successResponse(res, {
      statusCode: 200,
      message: 'Lấy thống kê số lượng nhân viên theo phòng ban thành công',
      data: result.departments,
      meta: result.summary,
    });
  } catch (error) {
    if (error instanceof DepartmentError) {
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
  getDepartments,
  getDepartmentById,
  getDepartmentStatistics,
  createDepartment,
  updateDepartment,
  deleteDepartment,
};
