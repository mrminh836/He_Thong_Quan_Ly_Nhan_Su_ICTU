import { getCurrentUser, getCurrentUserRole } from '../services/authService.js';
import { filterNavigationByRole, getRoleBadgeInfo } from '../utils/rbac.js';

/**
 * Render chuỗi HTML cho danh sách mục menu theo vai trò người dùng (RBAC)
 * @param {string|null} role - Vai trò của người dùng (ADMIN, HR_MANAGER, EMPLOYEE)
 * @param {string} currentPath - Đường dẫn hiện tại để kích hoạt class active
 * @returns {string} HTML string
 */
export function renderSidebarMenu(role, currentPath = '/dashboard') {
  const sections = filterNavigationByRole(role);
  if (!sections || sections.length === 0) {
    return `
      <div style="padding: 16px; color: #64748b; font-size: 12px; text-align: center;">
        Không có menu được phân quyền
      </div>
    `;
  }

  return sections
    .map((section) => `
      <div class="nav-section-title" id="${section.sectionId || ''}">${section.sectionTitle}</div>
      ${section.items
        .map((item) => {
          const isActive = currentPath === item.path || (item.path !== '/' && currentPath.startsWith(item.path));
          const badgeHtml = item.badge
            ? `<span class="nav-item-badge badge-${item.badge.toLowerCase()}">${item.badge}</span>`
            : '';
          return `
            <a href="${item.path}" class="nav-item ${isActive ? 'active' : ''}" data-link data-nav-path="${item.path}" id="${item.id || ''}">
              ${item.icon}
              <span>${item.label || item.title}</span>
              ${badgeHtml}
            </a>
          `;
        })
        .join('')}
    `)
    .join('');
}

/**
 * Component Sidebar điều hướng hệ thống quản trị
 * Tự động lọc các mục menu và hiển thị thông tin người dùng theo quyền hạn (RBAC)
 * @param {string} currentPath - Đường dẫn hiện tại để kích hoạt class active
 * @returns {string} HTML string
 */
export function renderSidebar(currentPath = '/dashboard') {
  const currentUser = getCurrentUser();
  const userRole = getCurrentUserRole();
  const badgeInfo = getRoleBadgeInfo(userRole);
  const navMenuHtml = renderSidebarMenu(userRole, currentPath);

  const fullName = currentUser?.fullName || currentUser?.username || 'Người dùng HRM';
  const nameParts = fullName.trim().split(' ');
  const initials = nameParts.length >= 2
    ? `${nameParts[nameParts.length - 2][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : fullName.slice(0, 2).toUpperCase();

  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <a href="/dashboard" class="sidebar-logo" data-link>
          <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <span>HRM ICTU</span>
        </a>
        <button class="sidebar-toggle-btn" id="sidebar-toggle-btn" title="Thu gọn / Mở rộng" aria-label="Toggle sidebar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg>
        </button>
      </div>

      <nav class="sidebar-nav">
        ${navMenuHtml}
      </nav>

      <div class="sidebar-footer">
        <div class="sidebar-user-card" title="${fullName} (${badgeInfo.label})">
          <div class="sidebar-user-avatar">${initials}</div>
          <div class="sidebar-user-info">
            <span class="sidebar-user-name">${fullName}</span>
            <span class="sidebar-role-badge ${badgeInfo.badgeClass}">${badgeInfo.shortLabel}</span>
          </div>
        </div>
        <div class="sidebar-footer-info">
          <span class="sidebar-footer-title">Học phần TKQT HTPM</span>
          <span class="sidebar-footer-desc">K23 • Đề tài 10 HRM</span>
        </div>
      </div>
    </aside>
  `;
}

export default renderSidebar;

