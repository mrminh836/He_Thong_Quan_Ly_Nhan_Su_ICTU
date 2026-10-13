import { errorResponse } from '../utils/response.js';

/**
 * Middleware bắt lỗi 404 cho các route không tồn tại
 */
export function notFoundHandler(req, res) {
  return errorResponse(res, {
    statusCode: 404,
    errorCode: 'ROUTE_NOT_FOUND',
    message: `Đường dẫn API [${req.method} ${req.originalUrl}] không tồn tại trên máy chủ.`,
  });
}

export default notFoundHandler;
