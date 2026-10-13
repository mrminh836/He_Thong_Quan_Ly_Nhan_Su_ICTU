import { renderPageHeader } from '../components/PageHeader.js';
import { showToast } from '../components/Toast.js';
import { qs } from '../utils/dom.js';

export function renderUsersPage() {
  const headerHtml = renderPageHeader({
    title: 'Quản lý tài khoản người dùng',
    subtitle: 'Phân quyền vai trò hệ thống (RBAC: Admin, HR Manager, Employee)',
    breadcrumbs: [{ label: 'Trang chủ', path: '/dashboard' }, { label: 'Tài khoản' }],
    actions: `
      <button class="btn btn-primary" id="btn-create-user">
        <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        <span>Cấp tài khoản mới</span>
      </button>
    `,
  });

  return `
    ${headerHtml}

    <div class="toolbar">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" placeholder="Tìm theo tên đăng nhập hoặc vai trò..." />
      </div>

      <div class="filter-group">
        <select class="select-input">
          <option value="all">Tất cả vai trò</option>
          <option value="admin">Quản trị viên (Admin)</option>
          <option value="hr">Quản lý nhân sự (HR)</option>
          <option value="employee">Nhân viên (Employee)</option>
        </select>
        <span class="badge badge-mock">3 tài khoản RBAC mẫu</span>
      </div>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Tên đăng nhập (Username)</th>
            <th>Vai trò (Role)</th>
            <th>Hồ sơ nhân viên liên kết</th>
            <th>Mật khẩu băm</th>
            <th>Trạng thái</th>
            <th style="text-align: right;">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td><strong>admin</strong></td>
            <td><span class="badge badge-danger">Admin (Toàn quyền)</span></td>
            <td>Đỗ Quang Minh (NV001)</td>
            <td><code>$2a$10$aVwM84IwEc... (Bcrypt)</code></td>
            <td><span class="badge badge-success">Active</span></td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm user-action-btn" data-user="admin">Đặt lại MK</button>
            </td>
          </tr>

          <tr>
            <td>2</td>
            <td><strong>hr</strong></td>
            <td><span class="badge badge-info">HR Manager</span></td>
            <td>Nguyễn Thị Thu Hà (NV002)</td>
            <td><code>$2a$10$hUIaNEqV6d... (Bcrypt)</code></td>
            <td><span class="badge badge-success">Active</span></td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm user-action-btn" data-user="hr">Đặt lại MK</button>
            </td>
          </tr>

          <tr>
            <td>3</td>
            <td><strong>emp1</strong></td>
            <td><span class="badge badge-warning">Employee</span></td>
            <td>Trần Văn Nam (NV003)</td>
            <td><code>$2a$10$ECSFWXymvV... (Bcrypt)</code></td>
            <td><span class="badge badge-success">Active</span></td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm user-action-btn" data-user="emp1">Đặt lại MK</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

export function initUsersPageEvents() {
  const createBtn = qs('#btn-create-user');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      showToast('Tính năng cấp tài khoản mới sẽ kết nối API ở Sprint sau.', 'info');
    });
  }

  document.querySelectorAll('.user-action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const user = btn.dataset.user;
      showToast(`Đã chọn đặt lại mật khẩu cho tài khoản [${user}].`, 'info');
    });
  });
}

export default {
  render: renderUsersPage,
  initEvents: initUsersPageEvents,
};
