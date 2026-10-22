import userRepository from '../repositories/userRepository.js';

/**
 * Lỗi nghiệp vụ liên quan đến tài khoản người dùng
 */
export class UserError extends Error {
  constructor(message, statusCode = 400, errorCode = 'USER_ERROR') {
    super(message);
    this.name = 'UserError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

/**
 * Cập nhật trạng thái tài khoản người dùng (Active / Locked)
 * Khi tài khoản bị Locked, token JWT của tài khoản đó sẽ mất hiệu lực ngay lập tức
 * ở các request tiếp theo thông qua cơ chế kiểm tra CSDL thời gian thực tại auth middleware.
 * 
 * @param {object} params
 * @param {number} params.targetUserId - ID người dùng cần cập nhật trạng thái
 * @param {string} params.newStatus - Trạng thái mới: 'Active' | 'Locked'
 * @param {number} params.currentUserId - ID của người thực hiện thao tác (Admin)
 * @param {string} [params.currentUserRole] - Vai trò của người thực hiện
 * @returns {Promise<object>} Dữ liệu tài khoản sau khi cập nhật
 */
export async function updateUserStatus({
  targetUserId,
  newStatus,
  currentUserId,
  currentUserRole = 'ADMIN',
}) {
  // 1. Kiểm tra targetUserId
  const parsedUserId = Number(targetUserId);
  if (!parsedUserId || !Number.isInteger(parsedUserId) || parsedUserId <= 0) {
    throw new UserError('ID tài khoản không hợp lệ. Vui lòng cung cấp số nguyên dương.', 400, 'INVALID_ID');
  }

  // 2. Kiểm tra newStatus
  if (!newStatus || typeof newStatus !== 'string' || !newStatus.trim()) {
    throw new UserError('Trạng thái tài khoản (status) là bắt buộc.', 400, 'VALIDATION_ERROR');
  }

  const cleanStatus = newStatus.trim();
  const ALLOWED_STATUSES = ['Active', 'Locked'];
  if (!ALLOWED_STATUSES.includes(cleanStatus)) {
    throw new UserError(
      'Trạng thái tài khoản không hợp lệ. Chỉ chấp nhận Active hoặc Locked.',
      400,
      'INVALID_STATUS'
    );
  }

  // 3. Chính sách an toàn: Quản trị viên không được phép tự khóa tài khoản của chính mình
  if (currentUserId && Number(currentUserId) === parsedUserId && cleanStatus === 'Locked') {
    throw new UserError(
      'Quản trị viên không thể tự khóa tài khoản của chính mình để tránh mất quyền quản trị.',
      400,
      'CANNOT_LOCK_SELF'
    );
  }

  // 4. Kiểm tra sự tồn tại của người dùng trong CSDL
  const user = await userRepository.findById(parsedUserId);
  if (!user) {
    throw new UserError('Không tìm thấy tài khoản người dùng.', 404, 'USER_NOT_FOUND');
  }

  const previousStatus = user.account_status;

  // 5. Cập nhật trạng thái trong database
  const success = await userRepository.updateAccountStatus(parsedUserId, cleanStatus);
  if (!success) {
    throw new UserError('Không thể cập nhật trạng thái tài khoản. Vui lòng thử lại.', 500, 'UPDATE_FAILED');
  }

  // 6. Ghi Audit Log hành động quản trị viên
  console.log(
    `[AUDIT USER STATUS] User ID ${parsedUserId} (${user.username}) status changed from '${previousStatus}' to '${cleanStatus}' by Admin ID ${currentUserId} at ${new Date().toISOString()}`
  );

  // 7. Lấy lại bản ghi mới nhất sau khi commit
  const updatedUser = await userRepository.findById(parsedUserId);

  return {
    id: updatedUser.user_id,
    userId: updatedUser.user_id,
    username: updatedUser.username,
    role: updatedUser.role,
    status: updatedUser.account_status,
    accountStatus: updatedUser.account_status,
    previousStatus,
    updatedAt: updatedUser.updated_at,
  };
}

/**
 * Lấy toàn bộ danh sách tài khoản người dùng
 * @returns {Promise<Array<object>>}
 */
export async function getAllUsers() {
  const users = await userRepository.findAll();
  return users.map((u) => ({
    id: u.user_id,
    userId: u.user_id,
    username: u.username,
    role: u.role,
    status: u.account_status,
    accountStatus: u.account_status,
    employeeId: u.employee_id,
    employeeCode: u.employee_code,
    fullName: u.full_name,
    email: u.email,
    phone: u.phone,
    position: u.position,
    departmentId: u.department_id,
    departmentName: u.department_name,
    employmentStatus: u.employment_status,
    lastLoginAt: u.last_login_at,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  }));
}

export default {
  UserError,
  updateUserStatus,
  getAllUsers,
};
