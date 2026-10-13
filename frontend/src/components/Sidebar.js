/**
 * Component Sidebar điều hướng hệ thống quản trị
 * @param {string} currentPath - Đường dẫn hiện tại để kích hoạt class active
 * @returns {string} HTML string
 */
export function renderSidebar(currentPath = '/dashboard') {
  const menuItems = [
    {
      title: 'Tổng quan',
      path: '/dashboard',
      icon: `<svg viewBox="0 0 24 24"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    },
    {
      title: 'Phòng ban',
      path: '/departments',
      icon: `<svg viewBox="0 0 24 24"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>`,
    },
    {
      title: 'Nhân viên',
      path: '/employees',
      icon: `<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    },
    {
      title: 'Chấm công',
      path: '/attendances',
      icon: `<svg viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>`,
    },
    {
      title: 'Tài khoản',
      path: '/users',
      icon: `<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    },
  ];

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
        <div class="nav-section-title">QUẢN TRỊ DOANH NGHIỆP</div>
        ${menuItems
          .map((item) => {
            const isActive = currentPath === item.path || (item.path !== '/' && currentPath.startsWith(item.path));
            return `
              <a href="${item.path}" class="nav-item ${isActive ? 'active' : ''}" data-link>
                ${item.icon}
                <span>${item.title}</span>
              </a>
            `;
          })
          .join('')}
      </nav>

      <div class="sidebar-footer">
        <div class="sidebar-footer-info">
          <span class="sidebar-footer-title">Học phần TKQT HTPM</span>
          <span class="sidebar-footer-desc">K23 • Đề tài 10 HRM</span>
        </div>
      </div>
    </aside>
  `;
}

export default renderSidebar;
