import { renderSidebar } from '../components/Sidebar.js';
import { renderHeader } from '../components/Header.js';
import { qs } from '../utils/dom.js';
import { showToast } from '../components/Toast.js';
import { authService } from '../services/authService.js';
import { navigateTo } from '../router/router.js';
import { openChangePasswordModal } from '../components/ChangePasswordModal.js';

/**
 * Layout Quản trị chính (AppLayout)
 * Bao gồm Sidebar, Header và Vùng nội dung
 * @param {string} contentHtml - Nội dung HTML của trang hiện tại
 * @param {string} currentPath - Đường dẫn route hiện tại
 * @returns {string} HTML string
 */
export function renderAppLayout(contentHtml = '', currentPath = '/dashboard') {
  return `
    <div class="app-shell" id="app-shell">
      <!-- Backdrop cho màn hình điện thoại -->
      <div class="sidebar-backdrop" id="sidebar-backdrop"></div>

      <!-- Thanh điều hướng trái -->
      ${renderSidebar(currentPath)}

      <!-- Khung làm việc chính -->
      <div class="main-wrapper">
        ${renderHeader()}
        <main class="main-content" id="page-container">
          ${contentHtml}
        </main>
      </div>
    </div>
  `;
}

/**
 * Kích hoạt các sự kiện tương tác của AppLayout (Sidebar, User Dropdown, Toast)
 */
export function initAppLayoutEvents() {
  const sidebar = qs('#sidebar');
  const toggleBtn = qs('#sidebar-toggle-btn');
  const mobileBtn = qs('#mobile-menu-btn');
  const backdrop = qs('#sidebar-backdrop');
  const userProfileBtn = qs('#user-profile-btn');
  const userDropdown = qs('#user-dropdown');
  const notificationsBtn = qs('#notifications-btn');

  // 1. Thu gọn / Mở rộng Sidebar trên Desktop
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }

  // 2. Mở / Đóng Sidebar trên Mobile
  if (mobileBtn && sidebar && backdrop) {
    mobileBtn.addEventListener('click', () => {
      sidebar.classList.add('mobile-open');
      backdrop.classList.add('show');
    });

    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      backdrop.classList.remove('show');
    });
  }

  // 3. Mở / Đóng Dropdown người dùng
  if (userProfileBtn && userDropdown) {
    userProfileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('show');
    });

    // Đóng dropdown khi click ra ngoài
    document.addEventListener('click', (e) => {
      if (!userDropdown.contains(e.target) && !userProfileBtn.contains(e.target)) {
        userDropdown.classList.remove('show');
      }
    });
  }

  // 4. Click chuông thông báo (Demo)
  if (notificationsBtn) {
    notificationsBtn.addEventListener('click', () => {
      showToast('Trung tâm thông báo đang được phát triển.', 'info');
    });
  }

  // 5. Mở Modal Đổi mật khẩu cá nhân (HRM-217)
  const changePasswordBtn = qs('#change-password-btn');
  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (userDropdown) {
        userDropdown.classList.remove('show');
      }
      openChangePasswordModal();
    });
  }

  // 6. Xử lý Đăng xuất (Logout)
  const logoutBtn = qs('#logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      authService.logout();
      showToast('Đã đăng xuất khỏi hệ thống thành công.', 'info');
      navigateTo('/login');
    });
  }
}

export default {
  renderAppLayout,
  initAppLayoutEvents,
};
