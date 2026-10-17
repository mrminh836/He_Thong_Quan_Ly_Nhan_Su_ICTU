import userRepository from '../repositories/userRepository.js';
import { comparePassword, hashPassword, validateNewPasswordPolicy } from '../utils/password.js';
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

/**
 * Nghiệp vụ đổi mật khẩu tài khoản của người dùng đã xác thực (HRM-216)
 * Đảm bảo:
 * 1. Chỉ đổi mật khẩu của chính tài khoản trong JWT
 * 2. Xác minh mật khẩu cũ chính xác bằng bcrypt.compare
 * 3. Kiểm tra chính sách mật khẩu mới (tối thiểu 12 ký tự, tối đa 72 byte, không khoảng trắng)
 * 4. Kiểm tra mật khẩu xác nhận (nếu có cung cấp)
 * 5. Ngăn chặn đặt lại mật khẩu mới trùng mật khẩu cũ
 * 6. Băm mật khẩu mới bằng Bcrypt trước khi lưu vào CSDL
 * 
 * @param {object} params
 * @param {number} params.userId - Định danh người dùng lấy từ JWT
 * @param {string} params.currentPassword - Mật khẩu hiện tại của người dùng
 * @param {string} params.newPassword - Mật khẩu mới cần đổi
 * @param {string} [params.confirmPassword] - Mật khẩu xác nhận
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function changePassword({ userId, currentPassword, newPassword, confirmPassword }) {
  // 1. Kiểm tra định danh người dùng
  if (!userId) {
    throw new AuthError('Định danh người dùng không hợp lệ hoặc thiếu phiên xác thực.', 401, 'UNAUTHORIZED');
  }

  // 2. Kiểm tra sự tồn tại của tham số
  if (!currentPassword || typeof currentPassword !== 'string') {
    throw new AuthError('Mật khẩu hiện tại là bắt buộc.', 400, 'VALIDATION_ERROR');
  }

  if (!newPassword || typeof newPassword !== 'string') {
    throw new AuthError('Mật khẩu mới là bắt buộc.', 400, 'VALIDATION_ERROR');
  }

  // 3. Kiểm tra mật khẩu xác nhận nếu có gửi lên
  if (confirmPassword !== undefined && confirmPassword !== null) {
    if (typeof confirmPassword !== 'string' || confirmPassword !== newPassword) {
      throw new AuthError('Mật khẩu xác nhận không trùng khớp với mật khẩu mới.', 400, 'CONFIRM_PASSWORD_MISMATCH');
    }
  }

  // 4. Kiểm tra chính sách mật khẩu mới
  const policyCheck = validateNewPasswordPolicy(newPassword);
  if (!policyCheck.isValid) {
    throw new AuthError(policyCheck.message, 400, policyCheck.errorCode);
  }

  // 5. Lấy thông tin tài khoản và password_hash hiện tại từ database
  const user = await userRepository.findAuthById(userId);
  if (!user) {
    throw new AuthError('Tài khoản người dùng không tồn tại.', 404, 'USER_NOT_FOUND');
  }

  // 6. Kiểm tra trạng thái tài khoản và trạng thái nhân sự
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

  // 7. Xác minh mật khẩu hiện tại bằng bcrypt.compare
  const isCurrentPasswordValid = await comparePassword(currentPassword, user.password_hash);
  if (!isCurrentPasswordValid) {
    throw new AuthError('Mật khẩu hiện tại không chính xác.', 400, 'INVALID_CURRENT_PASSWORD');
  }

  // 8. Kiểm tra mật khẩu mới không được trùng với mật khẩu cũ
  const isSamePassword = await comparePassword(newPassword, user.password_hash);
  if (isSamePassword) {
    throw new AuthError('Mật khẩu mới không được trùng với mật khẩu hiện tại.', 400, 'PASSWORD_REUSED');
  }

  // 9. Băm mật khẩu mới bằng thuật toán Bcrypt
  const newPasswordHash = await hashPassword(newPassword);

  // 10. Cập nhật vào cơ sở dữ liệu
  const isUpdated = await userRepository.updatePassword(userId, newPasswordHash);
  if (!isUpdated) {
    throw new AuthError('Không thể cập nhật mật khẩu. Vui lòng thử lại sau.', 500, 'DATABASE_UPDATE_ERROR');
  }

  return {
    success: true,
    message: 'Đổi mật khẩu thành công.',
  };
}

export default {
  login,
  getProfile,
  changePassword,
  AuthError,
};
