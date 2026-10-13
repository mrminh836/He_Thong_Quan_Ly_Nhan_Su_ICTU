import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Thuật toán mã hóa chữ ký bắt buộc
 */
const JWT_ALGORITHM = 'HS256';

/**
 * Chuyển đổi định dạng chuỗi thời gian (vd: '15m', '8h', '24h') sang giây
 * @param {string} durationStr 
 * @returns {number} Số giây tương ứng
 */
export function parseDurationToSeconds(durationStr) {
  if (typeof durationStr === 'number') {
    return durationStr;
  }

  const match = String(durationStr).trim().match(/^(\d+)([smhd])$/);
  if (!match) {
    return 28800; // Mặc định 8 giờ = 28,800 giây
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return 28800;
  }
}

/**
 * Tạo JWT Access Token với các claim tối thiểu và an toàn
 * Tuyệt đối không đưa mật khẩu, password_hash vào payload!
 * 
 * @param {object} user - Thông tin người dùng
 * @param {number} user.user_id - ID người dùng
 * @param {string} user.username - Tên đăng nhập
 * @param {string} user.role - Vai trò (Admin, HR, Employee)
 * @param {number|null} [user.employee_id] - ID nhân viên liên kết
 * @returns {{ token: string, expiresIn: number }}
 */
export function generateAccessToken(user) {
  if (!user || !user.user_id || !user.username) {
    throw new Error('Dữ liệu người dùng không hợp lệ để tạo access token.');
  }

  const payload = {
    sub: user.user_id,
    username: user.username,
    role: user.role || 'Employee',
    employeeId: user.employee_id || null,
  };

  const token = jwt.sign(payload, env.jwtSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: env.jwtExpiresIn,
  });

  const expiresInSeconds = parseDurationToSeconds(env.jwtExpiresIn);

  return {
    token,
    tokenType: 'Bearer',
    expiresIn: expiresInSeconds,
  };
}

/**
 * Xác minh tính hợp lệ và chữ ký của JWT Access Token
 * 
 * @param {string} token - Chuỗi Bearer token
 * @returns {object} Payload đã được giải mã
 */
export function verifyAccessToken(token) {
  if (!token) {
    throw new Error('Access token không được để trống.');
  }

  return jwt.verify(token, env.jwtSecret, {
    algorithms: [JWT_ALGORITHM],
  });
}

export default {
  generateAccessToken,
  verifyAccessToken,
  parseDurationToSeconds,
};
