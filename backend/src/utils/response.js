/**
 * Tiện ích chuẩn hóa cấu trúc phản hồi JSON (Response Standardizer)
 * Tương thích đồng thời chuẩn Enterprise Envelope:
 * - status: 'success' | 'error'
 * - success: true | false
 */

export function successResponse(res, {
  message = 'Thành công',
  data = null,
  statusCode = 200,
  meta = null,
} = {}) {
  const payload = {
    success: true,
    status: 'success',
    statusCode,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  if (meta) {
    payload.meta = meta;
  }

  return res.status(statusCode).json(payload);
}

export function errorResponse(res, {
  message = 'Đã xảy ra lỗi trong quá trình xử lý',
  statusCode = 500,
  errorCode = 'INTERNAL_SERVER_ERROR',
  details = null,
} = {}) {
  const payload = {
    success: false,
    status: 'error',
    statusCode,
    errorCode,
    code: errorCode,
    message,
    timestamp: new Date().toISOString(),
  };

  if (details && process.env.NODE_ENV !== 'production') {
    payload.details = details;
  }

  return res.status(statusCode).json(payload);
}

export default {
  successResponse,
  errorResponse,
};
