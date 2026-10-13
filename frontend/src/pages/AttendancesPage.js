import { renderPageHeader } from '../components/PageHeader.js';
import { showToast } from '../components/Toast.js';
import { qs } from '../utils/dom.js';

export function renderAttendancesPage() {
  const todayStr = new Date().toISOString().split('T')[0];

  const headerHtml = renderPageHeader({
    title: 'Quản lý chấm công',
    subtitle: 'Theo dõi nhật ký vào ca, tan ca và trạng thái điểm danh nhân viên',
    breadcrumbs: [{ label: 'Trang chủ', path: '/dashboard' }, { label: 'Chấm công' }],
    actions: `
      <button class="btn btn-primary" id="btn-quick-checkin">
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Check-in vào ca</span>
      </button>
      <button class="btn btn-secondary" id="btn-quick-checkout">
        <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <span>Check-out tan ca</span>
      </button>
    `,
  });

  return `
    ${headerHtml}

    <!-- Thanh công cụ lọc ngày và phòng ban -->
    <div class="toolbar">
      <div class="filter-group">
        <label style="font-size: 12px; font-weight: 600; color: #475569;">Chọn ngày:</label>
        <input type="date" value="${todayStr}" class="select-input" id="attendance-date-filter" style="background-image: none;" />

        <select class="select-input" id="attendance-status-filter">
          <option value="all">Tất cả trạng thái</option>
          <option value="ontime">Đúng giờ (OnTime)</option>
          <option value="late">Đi muộn (Late)</option>
          <option value="earlyleave">Về sớm (EarlyLeave)</option>
          <option value="absent">Vắng mặt (Absent)</option>
        </select>
      </div>

      <div class="filter-group">
        <span class="badge badge-success">3 Đúng giờ</span>
        <span class="badge badge-warning">1 Đi muộn</span>
        <span class="badge badge-danger">1 Về sớm</span>
        <span class="badge badge-mock">Dữ liệu mẫu hôm nay</span>
      </div>
    </div>

    <!-- Bảng dữ liệu chấm công -->
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Mã NV</th>
            <th>Họ và tên</th>
            <th>Ngày làm việc</th>
            <th>Giờ vào ca</th>
            <th>Giờ tan ca</th>
            <th>Trạng thái</th>
            <th>Ghi chú / Giải trình</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>NV001</strong></td>
            <td><strong>Đỗ Quang Minh</strong></td>
            <td>${todayStr}</td>
            <td><code>08:15:00</code></td>
            <td><code>17:35:00</code></td>
            <td><span class="badge badge-success">Đúng giờ (OnTime)</span></td>
            <td>Check-in đúng giờ tiêu chuẩn</td>
          </tr>

          <tr>
            <td><strong>NV002</strong></td>
            <td><strong>Nguyễn Thị Thu Hà</strong></td>
            <td>${todayStr}</td>
            <td><code>08:25:00</code></td>
            <td><code>17:30:00</code></td>
            <td><span class="badge badge-success">Đúng giờ (OnTime)</span></td>
            <td>Check-in đúng giờ</td>
          </tr>

          <tr>
            <td><strong>NV003</strong></td>
            <td><strong>Trần Văn Nam</strong></td>
            <td>${todayStr}</td>
            <td><code>08:45:00</code></td>
            <td><code>17:40:00</code></td>
            <td><span class="badge badge-warning">Đi muộn (Late)</span></td>
            <td>Đi muộn 15 phút do sự cố giao thông</td>
          </tr>

          <tr>
            <td><strong>NV004</strong></td>
            <td><strong>Lê Thị Mai</strong></td>
            <td>${todayStr}</td>
            <td><code>08:10:00</code></td>
            <td><code>16:45:00</code></td>
            <td><span class="badge badge-danger">Về sớm (EarlyLeave)</span></td>
            <td>Về sớm 45 phút có xin phép quản lý</td>
          </tr>

          <tr>
            <td><strong>NV005</strong></td>
            <td><strong>Phạm Quốc Hưng</strong></td>
            <td>${todayStr}</td>
            <td><code>08:05:00</code></td>
            <td><code>17:30:00</code></td>
            <td><span class="badge badge-success">Đúng giờ (OnTime)</span></td>
            <td>Đúng giờ ca làm</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

export function initAttendancesPageEvents() {
  const checkinBtn = qs('#btn-quick-checkin');
  const checkoutBtn = qs('#btn-quick-checkout');

  if (checkinBtn) {
    checkinBtn.addEventListener('click', () => {
      showToast('Ghi nhận Check-in thành công (Giả lập Client - API sẽ kết nối ở Sprint sau).', 'success');
    });
  }

  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      showToast('Ghi nhận Check-out thành công (Giả lập Client).', 'info');
    });
  }
}

export default {
  render: renderAttendancesPage,
  initEvents: initAttendancesPageEvents,
};
