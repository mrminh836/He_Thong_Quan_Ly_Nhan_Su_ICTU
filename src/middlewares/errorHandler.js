import { errorResponse } from '../utils/response.js';

/**
 * Middleware xử lý lỗi tập trung toàn hệ thống (Centralized Error Handler)
 */
export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  const errorCode = err.code || 'INTERNAL_SERVER_ERROR';

  console.error(`[Error] [${errorCode}] ${req.method} ${req.originalUrl}:`, err.message);

  // Không để lộ stack trace hoặc cấu trúc DB nội bộ ra ngoài production
  const safeMessage =
    statusCode >= 500 && process.env.NODE_ENV === 'production'
      ? 'Hệ thống đang gặp sự cố tạm thời. Vui lòng thử lại sau.'
      : err.message || 'Lỗi xử lý nội bộ máy chủ.';

  return errorResponse(res, {
    statusCode,
    errorCode,
    message: safeMessage,
    details: err.stack,
  });
}

export default errorHandler;
