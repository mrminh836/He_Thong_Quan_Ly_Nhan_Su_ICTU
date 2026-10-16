import userRepository from '../repositories/userRepository.js';
import { comparePassword } from '../utils/password.js';
import { generateAccessToken } from '../utils/jwt.js';

/**
 * Lỗi nghiệp vụ có gán kèm mã trạng thái HTTP (Custom Application Error)
 */
export class AuthError extends Error {
  constructor(message, statusCode = 400, errorCode = 'AUTH_ERROR') {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

/**
 * Xử lý nghiệp vụ đăng nhập người dùng
 * 
 * @param {object} credentials - Thông tin đăng nhập
 * @param {string} credentials.username - Tên đăng nhập hoặc email
 * @param {string} credentials.password - Mật khẩu thuần
 * @returns {Promise<{ accessToken: string, tokenType: string, expiresIn: number, user: object }>}
 */
export async function login({ username, password }) {
  // 1. Kiểm tra đầu vào
  if (!username || typeof username !== 'string' || !username.trim()) {
    throw new AuthError('Tên đăng nhập không được để trống.', 400, 'VALIDATION_ERROR');
  }

  if (!password || typeof password !== 'string') {
    throw new AuthError('Mật khẩu không được để trống.', 400, 'VALIDATION_ERROR');
  }

  const cleanUsername = username.trim();

  // 2. Tìm kiếm người dùng trong cơ sở dữ liệu
  const user = await userRepository.findByUsernameOrEmail(cleanUsername);

  // 3. Nếu không tìm thấy tài khoản -> Trả thông báo lỗi chung để chống User Enumeration
  if (!user) {
    throw new AuthError('Tên đăng nhập hoặc mật khẩu không chính xác.', 401, 'INVALID_CREDENTIALS');
  }

  // 4. So sánh mật khẩu băm bằng Bcrypt
  const isPasswordValid = await comparePassword(password, user.password_hash);
  if (!isPasswordValid) {
    throw new AuthError('Tên đăng nhập hoặc mật khẩu không chính xác.', 401, 'INVALID_CREDENTIALS');
  }

  // 5. Kiểm tra trạng thái tài khoản và trạng thái nhân sự
  if (user.account_status !== 'Active') {
    const statusText = user.account_status === 'Locked' ? 'đã bị khóa' : 'đã ngừng hoạt động';
    throw new AuthError(
      `Tài khoản của bạn ${statusText}. Vui lòng liên hệ Quản trị viên để được hỗ trợ.`,
      403,
      'ACCOUNT_LOCKED'
    );
  }

  if (user.employment_status === 'Resigned') {
    throw new AuthError(
      'Tài khoản nhân viên đã thôi việc và bị vô hiệu hóa quyền truy cập.',
      403,
      'ACCOUNT_LOCKED'
    );
  }

  // 6. Cập nhật thời điểm đăng nhập thành công
  try {
    await userRepository.updateLastLogin(user.user_id);
  } catch (err) {
    // Không làm gián đoạn đăng nhập nếu việc ghi log thời gian gặp sự cố nhỏ
    console.warn('[AuthService] Không thể cập nhật last_login_at:', err.message);
  }

  // 7. Tạo JWT Access Token an toàn
  const tokenData = generateAccessToken(user);

  // 8. Định hình thông tin người dùng an toàn (Loại bỏ password_hash)
  const safeUserData = {
    id: user.user_id,
    username: user.username,
    role: user.role,
    employeeId: user.employee_id || null,
    employeeCode: user.employee_code || null,
    fullName: user.full_name || null,
    email: user.email || null,
    phone: user.phone || null,
    position: user.position || null,
    departmentId: user.department_id || null,
    departmentName: user.department_name || null,
    hireDate: user.hire_date || null,
    employmentStatus: user.employment_status || null,
    accountStatus: user.account_status || 'Active',
  };

  return {
    accessToken: tokenData.token,
    tokenType: tokenData.tokenType,
    expiresIn: tokenData.expiresIn,
    user: safeUserData,
  };
}

/**
 * Lấy hồ sơ thông tin của người dùng hiện tại
 * 
 * @param {number} userId - ID người dùng lấy từ JWT sub
 * @returns {Promise<object>}
 */
export async function getProfile(userId) {
  if (!userId) {
    throw new AuthError('Mã người dùng không hợp lệ.', 400, 'INVALID_USER_ID');
  }

  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AuthError('Không tìm thấy tài khoản người dùng.', 404, 'USER_NOT_FOUND');
  }

  return {
    id: user.user_id,
    username: user.username,
    role: user.role,
    employeeId: user.employee_id || null,
    employeeCode: user.employee_code || null,
    accountStatus: user.account_status,
    fullName: user.full_name || null,
    email: user.email || null,
    phone: user.phone || null,
    position: user.position || null,
    departmentId: user.department_id || null,
    departmentName: user.department_name || null,
    hireDate: user.hire_date || null,
    employmentStatus: user.employment_status || null,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
  };
}

export default {
  login,
  getProfile,
  AuthError,
};
