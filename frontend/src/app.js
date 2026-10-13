import { initRouter } from './router/router.js';

/**
 * Khởi tạo toàn bộ ứng dụng Frontend SPA
 */
export function initApp() {
  console.log('🚀 Khởi động HRM Frontend SPA (Vanilla JS + Vite)...');
  initRouter();
}

export default {
  initApp,
};
