import { renderPageHeader } from '../components/PageHeader.js';
import { showToast } from '../components/Toast.js';
import { qs, qsa } from '../utils/dom.js';

export function renderEmployeesPage() {
  const headerHtml = renderPageHeader({
    title: 'Quản lý nhân viên',
    subtitle: 'Theo dõi hồ sơ nhân sự, chức danh và thông tin định danh cá nhân',
    breadcrumbs: [{ label: 'Trang chủ', path: '/dashboard' }, { label: 'Nhân viên' }],
    actions: `
      <button class="btn btn-primary" id="btn-add-emp">
        <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        <span>Thêm nhân sự mới</span>
      </button>
    `,
  });

  return `
    ${headerHtml}

    <!-- Thanh công cụ tìm kiếm và bộ lọc -->
    <div class="toolbar">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" id="emp-search-input" placeholder="Tìm theo mã NV, họ tên hoặc email..." />
      </div>

      <div class="filter-group">
        <select class="select-input" id="emp-dept-filter">
          <option value="all">Tất cả phòng ban</option>
          <option value="tech">PB Kỹ thuật & Công nghệ</option>
          <option value="hr">PB Nhân sự & Hành chính</option>
          <option value="biz">PB Kinh doanh & Marketing</option>
        </select>

        <select class="select-input" id="emp-status-filter">
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Đang làm việc (Active)</option>
          <option value="onleave">Nghỉ phép (OnLeave)</option>
          <option value="resigned">Đã thôi việc (Resigned)</option>
        </select>

        <span class="badge badge-mock">5 nhân sự mẫu</span>
      </div>
    </div>

    <!-- Bảng danh sách nhân viên -->
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Mã NV</th>
            <th>Họ và tên</th>
            <th>Email</th>
            <th>Số điện thoại</th>
            <th>Phòng ban</th>
            <th>Chức vụ</th>
            <th>CCCD (Đã che)</th>
            <th>Trạng thái</th>
            <th style="text-align: right;">Thao tác</th>
          </tr>
        </thead>
        <tbody id="emp-table-body">
          <tr>
            <td><strong>NV001</strong></td>
            <td><strong>Đỗ Quang Minh</strong></td>
            <td>minh.dq@hrm.local</td>
            <td>0987654321</td>
            <td>Kỹ thuật & Công nghệ</td>
            <td>Trưởng phòng</td>
            <td><code>0382******34</code></td>
            <td><span class="badge badge-success">Active</span></td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm emp-action-btn" data-id="NV001" data-action="view">Xem</button>
              <button class="btn btn-secondary btn-sm emp-action-btn" data-id="NV001" data-action="edit">Sửa</button>
            </td>
          </tr>

          <tr>
            <td><strong>NV002</strong></td>
            <td><strong>Nguyễn Thị Thu Hà</strong></td>
            <td>ha.ntt@hrm.local</td>
            <td>0976543210</td>
            <td>Nhân sự & Hành chính</td>
            <td>Trưởng phòng</td>
            <td><code>0383******78</code></td>
            <td><span class="badge badge-success">Active</span></td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm emp-action-btn" data-id="NV002" data-action="view">Xem</button>
              <button class="btn btn-secondary btn-sm emp-action-btn" data-id="NV002" data-action="edit">Sửa</button>
            </td>
          </tr>

          <tr>
            <td><strong>NV003</strong></td>
            <td><strong>Trần Văn Nam</strong></td>
            <td>nam.tv@hrm.local</td>
            <td>0965432109</td>
            <td>Kỹ thuật & Công nghệ</td>
            <td>Kỹ sư Phần mềm</td>
            <td><code>0382******12</code></td>
            <td><span class="badge badge-success">Active</span></td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm emp-action-btn" data-id="NV003" data-action="view">Xem</button>
              <button class="btn btn-secondary btn-sm emp-action-btn" data-id="NV003" data-action="edit">Sửa</button>
            </td>
          </tr>

          <tr>
            <td><strong>NV004</strong></td>
            <td><strong>Lê Thị Mai</strong></td>
            <td>mai.lt@hrm.local</td>
            <td>0954321098</td>
            <td>Kinh doanh & Marketing</td>
            <td>Chuyên viên Kinh doanh</td>
            <td><code>0383******56</code></td>
            <td><span class="badge badge-success">Active</span></td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm emp-action-btn" data-id="NV004" data-action="view">Xem</button>
              <button class="btn btn-secondary btn-sm emp-action-btn" data-id="NV004" data-action="edit">Sửa</button>
            </td>
          </tr>

          <tr>
            <td><strong>NV005</strong></td>
            <td><strong>Phạm Quốc Hưng</strong></td>
            <td>hung.pq@hrm.local</td>
            <td>0943210987</td>
            <td>Kỹ thuật & Công nghệ</td>
            <td>DevOps Engineer</td>
            <td><code>0382******90</code></td>
            <td><span class="badge badge-success">Active</span></td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm emp-action-btn" data-id="NV005" data-action="view">Xem</button>
              <button class="btn btn-secondary btn-sm emp-action-btn" data-id="NV005" data-action="edit">Sửa</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

export function initEmployeesPageEvents() {
  const addBtn = qs('#btn-add-emp');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      showToast('Modal thêm mới nhân sự (mã hóa CCCD AES-256) sẽ mở khi tích hợp Backend.', 'info');
    });
  }

  qsa('.emp-action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      showToast(`Đã chọn thao tác [${action}] cho nhân viên ${id}.`, 'info');
    });
  });

  const searchInput = qs('#emp-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const rows = qsa('#emp-table-body tr');
      rows.forEach((row) => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
      });
    });
  }
}

export default {
  render: renderEmployeesPage,
  initEvents: initEmployeesPageEvents,
};
