import bcrypt from 'bcrypt';

/**
 * Số vòng băm muối (Salt Rounds) cho Bcrypt
 * Khuyến nghị tối thiểu: 10 vòng cho môi trường dev, 12 vòng cho production
 */
const DEFAULT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;

/**
 * Băm mật khẩu thuần thành chuỗi băm Bcrypt an toàn
 * @param {string} plainPassword - Mật khẩu thuần cần băm
 * @param {number} [saltRounds=DEFAULT_SALT_ROUNDS] - Số vòng lặp băm muối
 * @returns {Promise<string>} Chuỗi mật khẩu đã băm (Bcrypt hash)
 */
export async function hashPassword(plainPassword, saltRounds = DEFAULT_SALT_ROUNDS) {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('Mật khẩu cần băm phải là một chuỗi ký tự hợp lệ.');
  }

  return await bcrypt.hash(plainPassword, saltRounds);
}

/**
 * So sánh mật khẩu do người dùng nhập với chuỗi băm lưu trong cơ sở dữ liệu
 * @param {string} candidatePassword - Mật khẩu người dùng nhập
 * @param {string} hashedPassword - Chuỗi băm Bcrypt lấy từ CSDL
 * @returns {Promise<boolean>} True nếu mật khẩu trùng khớp, ngược lại False
 */
export async function comparePassword(candidatePassword, hashedPassword) {
  if (!candidatePassword || !hashedPassword) {
    return false;
  }

  try {
    return await bcrypt.compare(candidatePassword, hashedPassword);
  } catch (error) {
    // Tránh để lỗi Bcrypt làm sập ứng dụng, trả về false nếu chuỗi hash không đúng định dạng
    return false;
  }
}

/**
 * Kiểm tra tính hợp lệ cơ bản của mật khẩu đầu vào
 * @param {string} password - Mật khẩu cần kiểm tra
 * @returns {{ isValid: boolean, message?: string }}
 */
export function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { isValid: false, message: 'Mật khẩu là bắt buộc và phải là chuỗi ký tự.' };
  }

  if (password.length < 6) {
    return { isValid: false, message: 'Mật khẩu phải chứa ít nhất 6 ký tự.' };
  }

  if (password.length > 100) {
    return { isValid: false, message: 'Mật khẩu không được vượt quá 100 ký tự.' };
  }

  return { isValid: true };
}

export default {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
};
