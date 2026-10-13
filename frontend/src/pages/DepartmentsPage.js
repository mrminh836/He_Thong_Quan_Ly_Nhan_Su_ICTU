import { renderPageHeader } from '../components/PageHeader.js';
import { showToast } from '../components/Toast.js';
import { qs, qsa } from '../utils/dom.js';

export function renderDepartmentsPage() {
  const headerHtml = renderPageHeader({
    title: 'Quản lý phòng ban',
    subtitle: 'Quản trị cơ cấu tổ chức và phân bổ nguồn lực các phòng ban',
    breadcrumbs: [{ label: 'Trang chủ', path: '/dashboard' }, { label: 'Phòng ban' }],
    actions: `
      <button class="btn btn-primary" id="btn-add-dept">
        <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Thêm phòng ban mới</span>
      </button>
    `,
  });

  return `
    ${headerHtml}

    <!-- Thanh công cụ tìm kiếm và lọc -->
    <div class="toolbar">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" id="dept-search-input" placeholder="Tìm theo mã hoặc tên phòng ban..." />
      </div>

      <div class="filter-group">
        <select class="select-input" id="dept-status-filter">
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Tạm ngưng</option>
        </select>
        <span class="badge badge-mock">Dữ liệu mẫu từ CSDL</span>
      </div>
    </div>

    <!-- Bảng danh sách phòng ban -->
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Mã PB</th>
            <th>Tên phòng ban</th>
            <th>Địa điểm / Tầng</th>
            <th>Điện thoại bàn</th>
            <th>Số nhân sự</th>
            <th>Trạng thái</th>
            <th style="text-align: right;">Thao tác</th>
          </tr>
        </thead>
        <tbody id="dept-table-body">
          <tr>
            <td><strong>PB-TECH</strong></td>
            <td>Phòng Kỹ thuật & Công nghệ</td>
            <td>Tầng 4 - Tòa nhà A</td>
            <td>0208-3846-001</td>
            <td><span class="badge badge-info">3 nhân sự</span></td>
            <td><span class="badge badge-success">Hoạt động</span></td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm action-btn" data-action="view" data-name="Phòng Kỹ thuật">Chi tiết</button>
              <button class="btn btn-secondary btn-sm action-btn" data-action="edit" data-name="Phòng Kỹ thuật">Sửa</button>
            </td>
          </tr>
          <tr>
            <td><strong>PB-HR</strong></td>
            <td>Phòng Nhân sự & Hành chính</td>
            <td>Tầng 3 - Tòa nhà A</td>
            <td>0208-3846-002</td>
            <td><span class="badge badge-info">1 nhân sự</span></td>
            <td><span class="badge badge-success">Hoạt động</span></td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm action-btn" data-action="view" data-name="Phòng Nhân sự">Chi tiết</button>
              <button class="btn btn-secondary btn-sm action-btn" data-action="edit" data-name="Phòng Nhân sự">Sửa</button>
            </td>
          </tr>
          <tr>
            <td><strong>PB-BIZ</strong></td>
            <td>Phòng Kinh doanh & Marketing</td>
            <td>Tầng 2 - Tòa nhà B</td>
            <td>0208-3846-003</td>
            <td><span class="badge badge-info">1 nhân sự</span></td>
            <td><span class="badge badge-success">Hoạt động</span></td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm action-btn" data-action="view" data-name="Phòng Kinh doanh">Chi tiết</button>
              <button class="btn btn-secondary btn-sm action-btn" data-action="edit" data-name="Phòng Kinh doanh">Sửa</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

export function initDepartmentsPageEvents() {
  const addBtn = qs('#btn-add-dept');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      showToast('Giao diện thêm phòng ban sẽ kết nối API ở Sprint tiếp theo.', 'info');
    });
  }

  qsa('.action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const name = btn.dataset.name;
      showToast(`Đã chọn thao tác [${action}] cho ${name} (Tính năng đang phát triển).`, 'info');
    });
  });

  const searchInput = qs('#dept-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const rows = qsa('#dept-table-body tr');
      rows.forEach((row) => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
      });
    });
  }
}

export default {
  render: renderDepartmentsPage,
  initEvents: initDepartmentsPageEvents,
};
