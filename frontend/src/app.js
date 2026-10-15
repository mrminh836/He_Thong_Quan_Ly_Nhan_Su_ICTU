import { initRouter } from './router/router.js';
import { isAuthenticated, fetchUserProfile } from './services/authService.js';

/**
 * Khởi tạo toàn bộ ứng dụng Frontend SPA
 */
export async function initApp() {
  console.log('🚀 Khởi động HRM Frontend SPA (Vanilla JS + Vite)...');

  // Nếu người dùng đã đăng nhập, đồng bộ lại hồ sơ & role mới nhất từ Backend (GET /api/auth/profile)
  if (isAuthenticated()) {
    try {
      await fetchUserProfile();
    } catch (error) {
      console.warn('[InitApp] Không thể đồng bộ hồ sơ ban đầu từ server:', error?.message);
    }
  }

  initRouter();
}

export default {
  initApp,
};

