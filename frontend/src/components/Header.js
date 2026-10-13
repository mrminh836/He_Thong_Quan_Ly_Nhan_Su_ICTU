/**
 * Component Header thanh điều khiển trên cùng
 * @returns {string} HTML string
 */
export function renderHeader() {
  return `
    <header class="header">
      <div class="header-left">
        <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Open mobile menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>

        <div class="header-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" placeholder="Tìm kiếm nhanh nhân sự, phòng ban..." aria-label="Tìm kiếm" />
        </div>
      </div>

      <div class="header-right">
        <!-- Nút thông báo -->
        <button class="header-icon-btn" id="notifications-btn" title="Thông báo hệ thống">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          <span class="badge-dot"></span>
        </button>

        <!-- Menu người dùng -->
        <div class="user-menu" id="user-menu-wrapper">
          <button class="user-profile-btn" id="user-profile-btn" aria-expanded="false" aria-haspopup="true">
            <div class="user-avatar">QM</div>
            <div class="user-meta">
              <span class="user-name">Đỗ Quang Minh</span>
              <span class="user-role">Quản trị viên (Admin)</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
          </button>

          <!-- Dropdown sổ xuống -->
          <div class="user-dropdown" id="user-dropdown">
            <div style="padding: 6px 12px; border-bottom: 1px solid #f1f5f9; margin-bottom: 4px;">
              <div style="font-weight: 600; font-size: 12px; color: #0f172a;">Đỗ Quang Minh</div>
              <div style="font-size: 11px; color: #64748b;">minh.dq@hrm.local</div>
            </div>
            <a href="/employees" class="dropdown-item" data-link>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg>
              <span>Hồ sơ nhân sự</span>
            </a>
            <div class="dropdown-divider"></div>
            <a href="/login" class="dropdown-item text-danger" data-link id="logout-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span>Đăng xuất</span>
            </a>
          </div>
        </div>
      </div>
    </header>
  `;
}

export default renderHeader;
