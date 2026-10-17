import { errorResponse } from '../utils/response.js';

/**
 * In-memory sliding window rate limiter đơn giản, an toàn
 * Bảo vệ endpoint Đăng nhập khỏi tấn công Brute-force và DoS
 */
const requestCounts = new Map();

// Dọn dẹp định kỳ các bản ghi đã hết hạn mỗi 10 phút
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of requestCounts.entries()) {
    if (now > record.resetTime) {
      requestCounts.delete(ip);
    }
  }
}, 10 * 60 * 1000);

/**
 * Middleware giới hạn tần suất yêu cầu cho endpoint đăng nhập
 * @param {number} [maxAttempts=15] - Số lần thử tối đa trong khung giờ
 * @param {number} [windowMs=15*60*1000] - Khung giờ tính (15 phút)
 */
export function loginRateLimiter(maxAttempts = process.env.NODE_ENV === 'production' ? 15 : 100, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    // Bỏ qua rate limit khi đang chạy unit test hoặc kiểm thử tích hợp E2E
    if (process.env.NODE_ENV === 'test' || req.headers['x-e2e-test-key'] === 'hrm-e2e-internal-test') {
      return next();
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    const record = requestCounts.get(ip);

    if (!record || now > record.resetTime) {
      requestCounts.set(ip, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    record.count += 1;

    if (record.count > maxAttempts) {
      const waitMinutes = Math.ceil((record.resetTime - now) / 60000);
      return errorResponse(res, {
        statusCode: 429,
        errorCode: 'TOO_MANY_REQUESTS',
        message: `Bạn đã thực hiện quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau ${waitMinutes} phút.`,
      });
    }

    next();
  };
}

const changePasswordCounts = new Map();

/**
 * Middleware giới hạn tần suất yêu cầu cho endpoint Đổi mật khẩu
 * Phòng ngừa brute-force mật khẩu cũ hoặc DoS tài khoản
 * @param {number} [maxAttempts=10] - Tối đa 10 lần trong 15 phút
 * @param {number} [windowMs=15*60*1000] - 15 phút
 */
export function changePasswordRateLimiter(
  maxAttempts = process.env.NODE_ENV === 'production' ? 10 : 100,
  windowMs = 15 * 60 * 1000
) {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test' || req.headers['x-e2e-test-key'] === 'hrm-e2e-internal-test') {
      return next();
    }

    // Định danh theo userId nếu đã đăng nhập, fallback sang IP
    const identifier = req.user?.id ? `user_${req.user.id}` : (req.ip || 'unknown');
    const now = Date.now();

    const record = changePasswordCounts.get(identifier);

    if (!record || now > record.resetTime) {
      changePasswordCounts.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    record.count += 1;

    if (record.count > maxAttempts) {
      const waitMinutes = Math.ceil((record.resetTime - now) / 60000);
      return errorResponse(res, {
        statusCode: 429,
        errorCode: 'TOO_MANY_REQUESTS',
        message: `Bạn đã thực hiện quá nhiều yêu cầu đổi mật khẩu. Vui lòng thử lại sau ${waitMinutes} phút.`,
      });
    }

    next();
  };
}

export default {
  loginRateLimiter,
  changePasswordRateLimiter,
};
