import { api } from './api.js';
import { normalizeRole } from '../utils/rbac.js';

/**
 * Hằng số khóa lưu trữ an toàn trong Web Storage
 */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'accessToken',
  USER: 'user',
  REMEMBER_USERNAME: 'hrm_remember_username',
};

/**
 * Lưu trữ Access Token vào localStorage
 * @param {string} token 
 */
export function setAccessToken(token) {
  if (token) {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
  }
}

/**
 * Lấy Access Token từ localStorage
 * @returns {string|null}
 */
export function getAccessToken() {
  return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

/**
 * Lưu thông tin người dùng an toàn vào localStorage (không chứa mật khẩu/hash)
 * @param {object} user 
 */
export function setCurrentUser(user) {
  if (user && typeof user === 'object') {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }
}

/**
 * Lấy thông tin người dùng hiện tại từ localStorage
 * @returns {object|null}
 */
export function getCurrentUser() {
  const userJson = localStorage.getItem(STORAGE_KEYS.USER);
  if (!userJson) return null;

  try {
    return JSON.parse(userJson);
  } catch (error) {
    console.error('[AuthService] Lỗi khi giải mã thông tin người dùng từ localStorage:', error);
    return null;
  }
}

/**
 * Lấy vai trò chuẩn hóa của người dùng hiện tại (ADMIN, HR_MANAGER, EMPLOYEE)
 * @returns {string}
 */
export function getCurrentUserRole() {
  const user = getCurrentUser();
  return normalizeRole(user?.role);
}

/**
 * Bí danh lấy vai trò người dùng hiện tại tuân thủ yêu cầu đề bài
 */
export const getCurrentRole = getCurrentUserRole;

/**
 * Lấy thông tin hồ sơ tài khoản trực tiếp từ API Backend (GET /api/auth/profile)
 * Giúp đồng bộ chính xác quyền hạn được Backend phê duyệt thay vì chỉ dựa vào client
 * @returns {Promise<object|null>}
 */
export async function fetchUserProfile() {
  if (!isAuthenticated()) return null;

  try {
    const response = await api.get('/auth/profile');
    const payload = response.data || response;
    if (payload) {
      setCurrentUser(payload);
      return payload;
    }
  } catch (error) {
    console.warn('[AuthService] Không thể đồng bộ hồ sơ từ Backend:', error?.message);
    // Nếu token hết hạn hoặc 401 Unauthorized, đăng xuất an toàn
    if (error?.statusCode === 401 || error?.status === 401) {
      logout();
    }
  }

  return getCurrentUser();
}

/**
 * Kiểm tra xem người dùng hiện tại đã đăng nhập hay chưa
 * @returns {boolean}
 */
export function isAuthenticated() {
  const token = getAccessToken();
  return Boolean(token && token.trim().length > 0);
}

/**
 * Lưu hoặc xóa tên đăng nhập ghi nhớ (Remember Me)
 * @param {string} username 
 * @param {boolean} remember 
 */
export function handleRememberUsername(username, remember) {
  if (remember && username) {
    localStorage.setItem(STORAGE_KEYS.REMEMBER_USERNAME, username.trim());
  } else {
    localStorage.removeItem(STORAGE_KEYS.REMEMBER_USERNAME);
  }
}

/**
 * Lấy tên đăng nhập đã được ghi nhớ từ trước (nếu có)
 * @returns {string}
 */
export function getRememberedUsername() {
  return localStorage.getItem(STORAGE_KEYS.REMEMBER_USERNAME) || '';
}

/**
 * Thực hiện yêu cầu đăng nhập lên API Backend
 * Endpoint: POST /api/auth/login
 * 
 * @param {object} credentials
 * @param {string} credentials.username - Tên đăng nhập hoặc Email
 * @param {string} credentials.password - Mật khẩu thuần
 * @param {boolean} [credentials.rememberMe=false] - Ghi nhớ đăng nhập
 * @returns {Promise<{ accessToken: string, user: object }>}
 */
export async function login({ username, password, rememberMe = false }) {
  if (!username || !password) {
    throw new Error('Tên đăng nhập và mật khẩu là bắt buộc.');
  }

  // Gửi request lên Backend Express API
  const response = await api.post('/auth/login', {
    username: username.trim(),
    password,
  });

  // Kiểm tra cấu trúc phản hồi thực tế từ Backend
  const payload = response.data || response;
  const accessToken = payload.accessToken;
  const user = payload.user;

  if (!accessToken) {
    throw new Error('Máy chủ phản hồi thiếu access token xác thực.');
  }

  // 1. Lưu token và thông tin người dùng an toàn vào localStorage
  setAccessToken(accessToken);
  if (user) {
    setCurrentUser(user);
  }

  // 2. Xử lý trạng thái ghi nhớ tên đăng nhập
  handleRememberUsername(username, rememberMe);

  return {
    accessToken,
    user,
  };
}

/**
 * Đăng xuất khỏi hệ thống: Xóa toàn bộ token và phiên làm việc
 */
export function logout() {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
  // Không xóa STORAGE_KEYS.REMEMBER_USERNAME để giữ tiện ích cho lần đăng nhập sau
}

export const authService = {
  login,
  logout,
  getAccessToken,
  setAccessToken,
  getCurrentUser,
  getCurrentUserRole,
  getCurrentRole,
  fetchUserProfile,
  setCurrentUser,
  isAuthenticated,
  handleRememberUsername,
  getRememberedUsername,
  STORAGE_KEYS,
};

export default authService;
