import { renderPageHeader } from '../components/PageHeader.js';
import { showToast } from '../components/Toast.js';
import { qs, qsa, sanitizeHTML } from '../utils/dom.js';
import { attendanceService } from '../services/attendanceService.js';
import { departmentService } from '../services/departmentService.js';
import { getCurrentUser, getCurrentUserRole } from '../services/authService.js';
import { openEmployeeDetailModal } from '../components/EmployeeDetailModal.js';
import {
  renderAttendanceWidgetMarkup,
  initAttendanceWidgetEvents,
  destroyAttendanceWidget,
  formatTimeDisplay,
} from '../components/AttendanceWidget.js';

/**
 * Biến lưu trữ trạng thái của Bảng chấm công hôm nay
 */
let rawAttendanceList = [];
let departmentsList = [];
let attendanceSummary = null;
let isLoading = false;
let loadError = null;

// Bộ lọc & Phân trang
let currentSearch = '';
let currentDepartmentId = 'all';
let currentStatus = 'all';
let currentPage = 1;
let currentLimit = 10;

/**
 * Lấy chữ cái đại diện (Initials) cho Avatar nhân viên
 * @param {string} fullName
 * @returns {string}
 */
function getInitials(fullName) {
  if (!fullName) return 'NV';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Sinh HTML cho Badge trạng thái chấm công của nhân viên
 * Tuân thủ quy tắc bảo toàn trạng thái Đi muộn kể cả sau khi đã check-out
 * 
 * @param {object} item
 * @returns {string}
 */
export function renderAttendanceRowStatusBadge(item) {
  const hasCheckIn = Boolean(item.checkInTime);
  const hasCheckOut = Boolean(item.checkOutTime);
  const isLate = item.status === 'LATE';

  // 1. Chưa check-in
  if (!hasCheckIn) {
    return `
      <span class="att-badge att-badge-neutral">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
        Chưa check-in
      </span>
    `;
  }

  // 2. Đã check-in nhưng chưa check-out
  if (!hasCheckOut) {
    if (isLate) {
      return `
        <span class="att-badge att-badge-warning">
          <svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
          Đi muộn
        </span>
      `;
    }
    return `
      <span class="att-badge att-badge-success">
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        Đúng giờ
      </span>
    `;
  }

  // 3. Đã check-out: Bảo toàn nhãn Đi muộn nếu vào ca muộn
  const lateOrOnTimeSubBadge = isLate
    ? `
      <span class="att-badge att-badge-warning">
        <svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
        Đi muộn
      </span>
    `
    : `
      <span class="att-badge att-badge-success">
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        Đúng giờ
      </span>
    `;

  return `
    <div style="display: flex; gap: 4px; flex-wrap: wrap;">
      <span class="att-badge att-badge-info">
        <svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Đã check-out
      </span>
      ${lateOrOnTimeSubBadge}
    </div>
  `;
}

/**
 * Sinh cấu trúc giao diện trang Quản lý Chấm công hôm nay
 */
export function renderAttendancesPage() {
  const userRole = getCurrentUserRole();
  const isEmployeeOnly = userRole === 'EMPLOYEE';

  const headerHtml = renderPageHeader({
    title: 'Bảng chấm công hôm nay',
    subtitle: isEmployeeOnly
      ? 'Theo dõi thời gian vào ca, tan ca và trạng thái điểm danh cá nhân'
      : 'Theo dõi thời gian thực danh sách nhân sự có mặt, đúng giờ, đi muộn và chưa check-in',
    breadcrumbs: [{ label: 'Trang chủ', path: '/dashboard' }, { label: 'Chấm công hôm nay' }],
    actions: `
      <button class="btn btn-secondary" id="btn-refresh-attendance">
        <svg viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        <span>Làm mới dữ liệu</span>
      </button>
      ${
        !isEmployeeOnly
          ? `
        <a href="/employees" class="btn btn-primary" data-link>
          <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>Danh sách nhân sự</span>
        </a>
      `
          : ''
      }
    `,
  });

  return `
    ${headerHtml}

    <!-- 1. WIDGET CHẤM CÔNG CÁ NHÂN (CHECK-IN / CHECK-OUT REALTIME) -->
    ${renderAttendanceWidgetMarkup()}

    <!-- 2. THÔNG BÁO CHO TÀI KHOẢN EMPLOYEE -->
    <div id="att-employee-notice" class="att-employee-notice-banner" style="display: ${isEmployeeOnly ? 'flex' : 'none'};">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>
      <div>
        <strong>Chế độ Nhân viên:</strong> Bạn đang xem nhật ký chấm công của chính mình theo chính sách phân quyền RBAC.
      </div>
    </div>

    <!-- 3. CÁC THẺ THỐNG KÊ TỔNG QUAN (5 KPI STATS CARDS) -->
    <div class="att-board-stats" id="att-stats-cards">
      <!-- Thẻ 1: Tổng nhân viên -->
      <div class="att-stat-card stat-total">
        <div class="att-stat-info">
          <span class="att-stat-label">Tổng nhân viên</span>
          <span class="att-stat-value" id="kpi-total-employees">--</span>
          <span class="att-stat-meta">Toàn công ty</span>
        </div>
        <div class="att-stat-icon">
          <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
      </div>

      <!-- Thẻ 2: Đã có mặt (Check-in) -->
      <div class="att-stat-card stat-present">
        <div class="att-stat-info">
          <span class="att-stat-label">Đã có mặt</span>
          <span class="att-stat-value" id="kpi-checked-in">--</span>
          <span class="att-stat-meta" id="kpi-present-pct">Đã check-in</span>
        </div>
        <div class="att-stat-icon">
          <svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
      </div>

      <!-- Thẻ 3: Đúng giờ -->
      <div class="att-stat-card stat-ontime">
        <div class="att-stat-info">
          <span class="att-stat-label">Đúng giờ</span>
          <span class="att-stat-value" id="kpi-ontime">--</span>
          <span class="att-stat-meta">Trước 08:30 sáng</span>
        </div>
        <div class="att-stat-icon">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
      </div>

      <!-- Thẻ 4: Đi muộn -->
      <div class="att-stat-card stat-late">
        <div class="att-stat-info">
          <span class="att-stat-label">Đi muộn</span>
          <span class="att-stat-value" id="kpi-late">--</span>
          <span class="att-stat-meta">Sau 08:30 sáng</span>
        </div>
        <div class="att-stat-icon">
          <svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
        </div>
      </div>

      <!-- Thẻ 5: Chưa check-in -->
      <div class="att-stat-card stat-notchecked">
        <div class="att-stat-info">
          <span class="att-stat-label">Chưa check-in</span>
          <span class="att-stat-value" id="kpi-not-checked">--</span>
          <span class="att-stat-meta" id="kpi-checkout-meta">Đang vắng</span>
        </div>
        <div class="att-stat-icon">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="8" x2="16" y1="12" y2="12"/></svg>
        </div>
      </div>
    </div>

    <!-- 4. THANH TÌM KIẾM VÀ BỘ LỌC (TOOLBAR) -->
    <div class="att-board-toolbar" id="att-board-toolbar" style="display: ${isEmployeeOnly ? 'none' : 'flex'};">
      <div class="att-search-wrapper">
        <svg class="search-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>
        <input
          type="text"
          class="att-search-input"
          id="att-search-input"
          placeholder="Tìm theo họ tên hoặc mã nhân viên (VD: NV001, Minh)..."
          autocomplete="off"
        />
        <button type="button" class="btn-clear-search" id="btn-clear-search" title="Xóa từ khóa tìm kiếm">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="att-filter-group">
        <!-- Bộ lọc phòng ban -->
        <div class="att-filter-item">
          <span>Phòng ban:</span>
          <select class="att-select-input" id="att-dept-filter">
            <option value="all">Tất cả phòng ban</option>
          </select>
        </div>

        <!-- Bộ lọc trạng thái -->
        <div class="att-filter-item">
          <span>Trạng thái:</span>
          <select class="att-select-input" id="att-status-filter">
            <option value="all">Tất cả trạng thái</option>
            <option value="present">Đã có mặt (Check-in)</option>
            <option value="ontime">Đúng giờ (ON_TIME)</option>
            <option value="late">Đi muộn (LATE)</option>
            <option value="not_checked_in">Chưa check-in</option>
            <option value="checked_out">Đã check-out</option>
          </select>
        </div>

        <!-- Nút đặt lại bộ lọc -->
        <button type="button" class="btn-reset-filters" id="btn-reset-filters" title="Đặt lại bộ lọc về mặc định">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          <span>Đặt lại</span>
        </button>
      </div>
    </div>

    <!-- 5. THÔNG BÁO LỖI NẾU GỌI API THẤT BẠI -->
    <div id="att-error-banner" class="att-error-banner" style="display: none;">
      <div class="att-error-content">
        <svg viewBox="0 0 24 24" width="24" height="24" stroke="#dc2626" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
        <div>
          <strong style="color: #991b1b;">Không thể tải dữ liệu bảng chấm công.</strong>
          <div id="att-error-text" style="font-size: 12px; color: #b91c1c;">Vui lòng kiểm tra kết nối mạng và thử lại.</div>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" id="btn-retry-attendance">
        <svg viewBox="0 0 24 24" width="14" height="14"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        <span>Thử lại</span>
      </button>
    </div>

    <!-- 6. BẢNG DỮ LIỆU CHẤM CÔNG HÔM NAY -->
    <div class="att-table-card">
      <div class="att-table-header-bar">
        <div class="att-table-title-group">
          <h3 class="att-table-title">Danh sách chấm công hôm nay</h3>
          <span class="badge badge-info" id="att-filtered-count-badge">Đang tải...</span>
        </div>
      </div>

      <div class="table-container" style="border: none; border-radius: 0;">
        <table class="data-table" id="att-data-table">
          <thead>
            <tr>
              <th style="width: 60px; text-align: center;">STT</th>
              <th style="min-width: 240px;">Nhân viên</th>
              <th style="min-width: 180px;">Phòng ban</th>
              <th style="width: 140px;">Giờ check-in</th>
              <th style="width: 140px;">Giờ check-out</th>
              <th style="min-width: 170px;">Trạng thái</th>
              <th style="width: 120px; text-align: center;">Thao tác</th>
            </tr>
          </thead>
          <tbody id="att-table-body">
            <tr>
              <td colspan="7">
                <div class="loading-container">
                  <div class="spinner"></div>
                  <span>Đang tải danh sách chấm công từ máy chủ...</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 7. THANH PHÂN TRANG (PAGINATION) -->
      <div class="att-pagination-bar" id="att-pagination-bar" style="display: none;">
        <div class="att-pagination-info">
          <span>Hiển thị</span>
          <select class="select-input att-limit-select" id="att-limit-select">
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
          <span id="att-pagination-text">nhân viên / trang</span>
        </div>

        <div class="att-pagination-controls" id="att-pagination-controls">
          <!-- Các nút phân trang render động -->
        </div>
      </div>
    </div>
  `;
}

/**
 * Tải danh sách phòng ban từ Backend để đưa vào Dropdown lọc
 */
async function loadDepartmentOptions() {
  const deptSelect = qs('#att-dept-filter');
  if (!deptSelect) return;

  try {
    const res = await departmentService.getDepartments({ limit: 100 });
    departmentsList = res.items || [];

    let optionsHtml = '<option value="all">Tất cả phòng ban</option>';
    departmentsList.forEach((dept) => {
      const isSelected = String(dept.department_id) === String(currentDepartmentId);
      optionsHtml += `
        <option value="${dept.department_id}" ${isSelected ? 'selected' : ''}>
          ${sanitizeHTML(dept.department_name)}
        </option>
      `;
    });

    deptSelect.innerHTML = optionsHtml;
  } catch (err) {
    console.warn('[AttendanceBoard] Không thể tải danh sách phòng ban cho bộ lọc:', err);
  }
}

/**
 * Cập nhật số liệu hiển thị trên 5 thẻ KPI tổng quan
 */
function updateSummaryCardsUI() {
  const summary = attendanceService.calculateAttendanceSummary(rawAttendanceList, attendanceSummary);

  const totalEl = qs('#kpi-total-employees');
  const checkedInEl = qs('#kpi-checked-in');
  const onTimeEl = qs('#kpi-ontime');
  const lateEl = qs('#kpi-late');
  const notCheckedEl = qs('#kpi-not-checked');
  const presentPctEl = qs('#kpi-present-pct');
  const checkoutMetaEl = qs('#kpi-checkout-meta');

  if (totalEl) totalEl.textContent = summary.totalEmployees;
  if (checkedInEl) checkedInEl.textContent = summary.checkedIn;
  if (onTimeEl) onTimeEl.textContent = summary.onTime;
  if (lateEl) lateEl.textContent = summary.late;
  if (notCheckedEl) notCheckedEl.textContent = summary.notCheckedIn;

  if (presentPctEl) {
    const pct = summary.totalEmployees > 0
      ? Math.round((summary.checkedIn / summary.totalEmployees) * 100)
      : 0;
    presentPctEl.textContent = `${pct}% đã có mặt`;
  }

  if (checkoutMetaEl && summary.checkedOut > 0) {
    checkoutMetaEl.textContent = `${summary.checkedOut} đã check-out`;
  }
}

/**
 * Render bảng dữ liệu chấm công dựa trên bộ lọc và phân trang hiện tại
 */
function renderTableUI() {
  const tbody = qs('#att-table-body');
  const countBadge = qs('#att-filtered-count-badge');
  const paginationBar = qs('#att-pagination-bar');
  const paginationControls = qs('#att-pagination-controls');
  const paginationText = qs('#att-pagination-text');
  const errorBanner = qs('#att-error-banner');

  if (!tbody) return;

  // 1. Trường hợp có lỗi kết nối
  if (loadError) {
    if (errorBanner) {
      errorBanner.style.display = 'flex';
      const errorText = qs('#att-error-text');
      if (errorText) errorText.textContent = loadError;
    }
    if (paginationBar) paginationBar.style.display = 'none';
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <div class="empty-state-icon" style="background-color: #fee2e2; color: #dc2626;">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
            </div>
            <div class="empty-state-title">Lỗi tải dữ liệu</div>
            <div class="empty-state-desc">${sanitizeHTML(loadError)}</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  if (errorBanner) {
    errorBanner.style.display = 'none';
  }

  // 2. Trường hợp đang tải
  if (isLoading) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="loading-container">
            <div class="spinner"></div>
            <span>Đang tải danh sách chấm công từ máy chủ...</span>
          </div>
        </td>
      </tr>
    `;
    if (countBadge) countBadge.textContent = 'Đang tải...';
    if (paginationBar) paginationBar.style.display = 'none';
    return;
  }

  // 3. Thực hiện lọc danh sách
  const filteredItems = attendanceService.filterAttendanceList(rawAttendanceList, {
    search: currentSearch,
    departmentId: currentDepartmentId,
    status: currentStatus,
  });

  // 4. Trường hợp danh sách rỗng sau khi lọc
  if (filteredItems.length === 0) {
    if (countBadge) countBadge.textContent = '0 nhân viên';
    if (paginationBar) paginationBar.style.display = 'none';
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <div class="empty-state-icon">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>
            </div>
            <div class="empty-state-title">Không tìm thấy dữ liệu chấm công</div>
            <div class="empty-state-desc">
              Không có nhân viên nào phù hợp với điều kiện tìm kiếm hoặc bộ lọc hiện tại.
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-clear-empty-filter">
              <span>Xóa bộ lọc</span>
            </button>
          </div>
        </td>
      </tr>
    `;

    const clearFilterBtn = qs('#btn-clear-empty-filter');
    if (clearFilterBtn) {
      clearFilterBtn.addEventListener('click', resetFilters);
    }
    return;
  }

  // 5. Thực hiện phân trang
  const paginated = attendanceService.paginateAttendanceList(filteredItems, currentPage, currentLimit);
  currentPage = paginated.page;

  if (countBadge) {
    countBadge.textContent = `${filteredItems.length} nhân viên`;
  }

  // Render các hàng dữ liệu
  const rowsHtml = paginated.items.map((item, index) => {
    const stt = paginated.startIndex + index + 1;
    const initials = getInitials(item.fullName);
    const checkInTimeText = formatTimeDisplay(item.checkInTime);
    const checkOutTimeText = formatTimeDisplay(item.checkOutTime);
    const statusBadgeHtml = renderAttendanceRowStatusBadge(item);
    const hasCheckIn = Boolean(item.checkInTime);
    const hasCheckOut = Boolean(item.checkOutTime);

    return `
      <tr data-emp-id="${item.employeeId}">
        <td style="text-align: center; color: #64748b; font-weight: 600;">${stt}</td>
        
        <td>
          <div class="att-emp-cell">
            <div class="att-emp-avatar">${initials}</div>
            <div class="att-emp-info">
              <span class="att-emp-name">${sanitizeHTML(item.fullName || 'Nhân viên')}</span>
              <span class="att-emp-code-badge">${sanitizeHTML(item.employeeCode || `NV${String(item.employeeId).padStart(3, '0')}`)}</span>
            </div>
          </div>
        </td>

        <td>
          <span style="color: #334155; font-weight: 500;">
            ${sanitizeHTML(item.departmentName || 'Chưa phân bổ')}
          </span>
        </td>

        <td>
          <span class="att-time-tag ${!hasCheckIn ? 'is-empty' : ''}">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            ${checkInTimeText}
          </span>
        </td>

        <td>
          <span class="att-time-tag ${!hasCheckOut ? 'is-empty' : ''}">
            <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            ${checkOutTimeText}
          </span>
        </td>

        <td>
          ${statusBadgeHtml}
        </td>

        <td style="text-align: center;">
          <button type="button" class="btn-view-emp-detail" data-emp-id="${item.employeeId}" title="Xem hồ sơ chi tiết nhân viên">
            <svg viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>Hồ sơ</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml;

  // 6. Cập nhật thanh phân trang
  if (paginationBar) {
    paginationBar.style.display = 'flex';
  }

  if (paginationText) {
    paginationText.textContent = `Hiển thị ${paginated.startIndex + 1} - ${paginated.endIndex} trên tổng số ${filteredItems.length} nhân viên`;
  }

  // Render các nút số trang
  if (paginationControls) {
    let controlsHtml = `
      <button type="button" class="att-page-btn" id="btn-att-prev-page" ${paginated.page <= 1 ? 'disabled' : ''} title="Trang trước">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
    `;

    for (let p = 1; p <= paginated.totalPages; p++) {
      if (
        p === 1 ||
        p === paginated.totalPages ||
        (p >= paginated.page - 1 && p <= paginated.page + 1)
      ) {
        controlsHtml += `
          <button type="button" class="att-page-btn ${p === paginated.page ? 'is-active' : ''}" data-page="${p}">
            ${p}
          </button>
        `;
      } else if (p === paginated.page - 2 || p === paginated.page + 2) {
        controlsHtml += `<span style="padding: 0 4px; color: #94a3b8;">...</span>`;
      }
    }

    controlsHtml += `
      <button type="button" class="att-page-btn" id="btn-att-next-page" ${paginated.page >= paginated.totalPages ? 'disabled' : ''} title="Trang tiếp">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    `;

    paginationControls.innerHTML = controlsHtml;
  }
}

/**
 * Tải dữ liệu bảng chấm công hôm nay từ Backend API
 */
export async function loadTodayAttendanceBoard() {
  isLoading = true;
  loadError = null;
  renderTableUI();

  try {
    const res = await attendanceService.getTodayAttendance();
    const currentUser = getCurrentUser();
    const userRole = getCurrentUserRole();

    // 1. Nếu là Admin hoặc HR Manager: Nhận mảng toàn công ty
    if (Array.isArray(res.data)) {
      rawAttendanceList = res.data;
      attendanceSummary = res.summary || null;
    } else if (res.data && typeof res.data === 'object') {
      // 2. Nếu là Employee: Backend trả về một đối tượng chấm công cá nhân
      const personalRecord = res.data;
      // Gán bổ sung thông tin hiển thị nếu chưa có
      if (!personalRecord.fullName && currentUser) {
        personalRecord.fullName = currentUser.fullName || currentUser.username;
      }
      if (!personalRecord.employeeCode && currentUser) {
        personalRecord.employeeCode = currentUser.username;
      }
      rawAttendanceList = [personalRecord];
      attendanceSummary = {
        totalEmployees: 1,
        checkedIn: personalRecord.checkInTime ? 1 : 0,
        onTime: personalRecord.checkInTime && personalRecord.status !== 'LATE' ? 1 : 0,
        late: personalRecord.status === 'LATE' ? 1 : 0,
        notCheckedIn: !personalRecord.checkInTime ? 1 : 0,
        checkedOut: personalRecord.checkOutTime ? 1 : 0,
      };
    } else {
      // Chưa có dữ liệu hoặc rỗng
      rawAttendanceList = [];
      attendanceSummary = null;
    }

    updateSummaryCardsUI();
  } catch (err) {
    console.error('[AttendanceBoard] Lỗi tải dữ liệu bảng chấm công:', err);
    loadError = (err.data && err.data.message) || err.message || 'Không thể kết nối máy chủ chấm công.';
    rawAttendanceList = [];
    attendanceSummary = null;
  } finally {
    isLoading = false;
    renderTableUI();
  }
}

/**
 * Đặt lại toàn bộ bộ lọc và từ khóa tìm kiếm về mặc định
 */
function resetFilters() {
  currentSearch = '';
  currentDepartmentId = 'all';
  currentStatus = 'all';
  currentPage = 1;

  const searchInput = qs('#att-search-input');
  const clearSearchBtn = qs('#btn-clear-search');
  const deptSelect = qs('#att-dept-filter');
  const statusSelect = qs('#att-status-filter');

  if (searchInput) searchInput.value = '';
  if (clearSearchBtn) clearSearchBtn.style.display = 'none';
  if (deptSelect) deptSelect.value = 'all';
  if (statusSelect) statusSelect.value = 'all';

  renderTableUI();
}

/**
 * Khởi tạo toàn bộ sự kiện cho Bảng chấm công hôm nay
 */
export function initAttendancesPageEvents() {
  // 1. Khởi tạo Widget chấm công thời gian thực (Check-in / Check-out)
  initAttendanceWidgetEvents();

  // 2. Nạp danh sách phòng ban cho dropdown lọc
  loadDepartmentOptions();

  // 3. Tải dữ liệu bảng chấm công hôm nay
  loadTodayAttendanceBoard();

  // 4. Lắng nghe ô tìm kiếm (Họ tên / Mã nhân viên)
  const searchInput = qs('#att-search-input');
  const clearSearchBtn = qs('#btn-clear-search');
  let searchDebounce = null;

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (clearSearchBtn) {
        clearSearchBtn.style.display = val.length > 0 ? 'flex' : 'none';
      }

      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        currentSearch = val;
        currentPage = 1; // Reset về trang 1 khi tìm kiếm
        renderTableUI();
      }, 250);
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      currentSearch = '';
      currentPage = 1;
      renderTableUI();
      if (searchInput) searchInput.focus();
    });
  }

  // 5. Lắng nghe bộ lọc phòng ban
  const deptSelect = qs('#att-dept-filter');
  if (deptSelect) {
    deptSelect.addEventListener('change', (e) => {
      currentDepartmentId = e.target.value;
      currentPage = 1;
      renderTableUI();
    });
  }

  // 6. Lắng nghe bộ lọc trạng thái
  const statusSelect = qs('#att-status-filter');
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      currentStatus = e.target.value;
      currentPage = 1;
      renderTableUI();
    });
  }

  // 7. Lắng nghe nút đặt lại bộ lọc
  const resetBtn = qs('#btn-reset-filters');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetFilters);
  }

  // 8. Lắng nghe nút Làm mới dữ liệu
  const refreshBtn = qs('#btn-refresh-attendance');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      showToast('Đang cập nhật dữ liệu bảng chấm công hôm nay...', 'info');
      loadTodayAttendanceBoard();
    });
  }

  // 9. Lắng nghe nút Thử lại khi có lỗi
  const retryBtn = qs('#btn-retry-attendance');
  if (retryBtn) {
    retryBtn.addEventListener('click', loadTodayAttendanceBoard);
  }

  // 10. Lắng nghe thay đổi số lượng bản ghi / trang
  const limitSelect = qs('#att-limit-select');
  if (limitSelect) {
    limitSelect.value = String(currentLimit);
    limitSelect.addEventListener('change', (e) => {
      currentLimit = Number(e.target.value) || 10;
      currentPage = 1;
      renderTableUI();
    });
  }

  // 11. Lắng nghe sự kiện chuyển trang (Previous, Next, số trang)
  const paginationControls = qs('#att-pagination-controls');
  if (paginationControls) {
    paginationControls.addEventListener('click', (e) => {
      const prevBtn = e.target.closest('#btn-att-prev-page');
      const nextBtn = e.target.closest('#btn-att-next-page');
      const pageBtn = e.target.closest('button[data-page]');

      if (prevBtn && currentPage > 1) {
        currentPage--;
        renderTableUI();
      } else if (nextBtn) {
        currentPage++;
        renderTableUI();
      } else if (pageBtn) {
        const targetPage = Number(pageBtn.getAttribute('data-page'));
        if (targetPage && targetPage !== currentPage) {
          currentPage = targetPage;
          renderTableUI();
        }
      }
    });
  }

  // 12. Lắng nghe nút "Xem hồ sơ chi tiết" trên từng dòng bảng
  const tableBody = qs('#att-table-body');
  if (tableBody) {
    tableBody.addEventListener('click', (e) => {
      const viewBtn = e.target.closest('.btn-view-emp-detail');
      if (viewBtn) {
        const empId = viewBtn.getAttribute('data-emp-id');
        if (empId) {
          openEmployeeDetailModal(empId, viewBtn);
        }
      }
    });
  }
}

/**
 * Hàm dọn dẹp tài nguyên khi unmount trang (SPA router lifecycle)
 */
export function destroyAttendancesPage() {
  destroyAttendanceWidget();
  rawAttendanceList = [];
  departmentsList = [];
  attendanceSummary = null;
  isLoading = false;
  loadError = null;
  currentSearch = '';
  currentDepartmentId = 'all';
  currentStatus = 'all';
  currentPage = 1;
}

export default {
  render: renderAttendancesPage,
  initEvents: initAttendancesPageEvents,
  destroy: destroyAttendancesPage,
  renderAttendanceRowStatusBadge,
};
