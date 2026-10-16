import { renderPageHeader } from '../components/PageHeader.js';
import { showToast } from '../components/Toast.js';
import { qs, sanitizeHTML } from '../utils/dom.js';
import { attendanceService } from '../services/attendanceService.js';
import { employeeService } from '../services/employeeService.js';
import { getCurrentUser, getCurrentUserRole } from '../services/authService.js';
import { ROLES } from '../utils/rbac.js';

/**
 * ==============================================================================
 * PAGE: AttendanceHistoryPage (Bảng Lịch Sử Chấm Công Theo Tháng) - US 19.0
 * ==============================================================================
 * Cho phép:
 * - Chọn tháng (1 - 12) và năm (2024 - 2027)
 * - Lọc theo nhân viên (chỉ dành cho Admin / HR Manager)
 * - Xem chi tiết từng ngày: Ngày, Thứ, Giờ vào (HH:mm), Giờ ra (HH:mm), Trạng thái, Ghi chú
 * - Xem 4 thẻ thống kê KPI chuẩn xác từ backend (Tổng ngày công, Đúng giờ, Đi muộn, Về sớm)
 * - Phân trang đầy đủ kết hợp bộ lọc (page, limit 10, 20, 31)
 */

// Trạng thái cục bộ của trang
const state = {
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  employeeId: 'all',
  page: 1,
  limit: 31,
  data: [],
  summary: {
    totalWorkDays: 0,
    lateCount: 0,
    earlyLeaveCount: 0,
  },
  pagination: {
    page: 1,
    limit: 31,
    totalRecords: 0,
    totalPages: 1,
  },
  employeesList: [],
  isLoading: false,
  error: null,
};

/**
 * Lấy tên Thứ trong tuần theo ngày YYYY-MM-DD
 * @param {string} dateStr
 * @returns {{ dayName: string, isWeekend: boolean }}
 */
function getDayOfWeekInfo(dateStr) {
  if (!dateStr) return { dayName: '--', isWeekend: false };
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0 = CN, 1 = T2, ..., 6 = T7
  const dayNames = [
    'Chủ Nhật',
    'Thứ Hai',
    'Thứ Ba',
    'Thứ Tư',
    'Thứ Năm',
    'Thứ Sáu',
    'Thứ Bảy',
  ];
  return {
    dayName: dayNames[day] || '--',
    isWeekend: day === 0 || day === 6,
  };
}

/**
 * Định dạng ngày YYYY-MM-DD sang dd/MM/yyyy
 * @param {string} dateStr
 * @returns {string}
 */
function formatDateDisplay(dateStr) {
  if (!dateStr) return '--';
  const parts = String(dateStr).slice(0, 10).split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Định dạng giờ HH:mm:ss sang HH:mm
 * @param {string|null} timeStr
 * @returns {string}
 */
function formatTimeShort(timeStr) {
  if (!timeStr) return '--';
  const raw = String(timeStr).trim();
  if (raw.length >= 5) {
    return raw.slice(0, 5);
  }
  return raw;
}

/**
 * Render chuỗi HTML cho Badge trạng thái chấm công
 * @param {object} item
 * @returns {string}
 */
function renderStatusBadge(item) {
  const hasCheckIn = Boolean(item.checkInTime);
  const hasCheckOut = Boolean(item.checkOutTime);
  const isLate = Boolean(item.isLate);
  const isEarly = Boolean(item.isEarlyLeave);

  if (!hasCheckIn) {
    return `
      <span class="att-status-badge att-status-pending">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
        <span>Chưa chấm công</span>
      </span>
    `;
  }

  if (isLate && isEarly) {
    return `
      <span class="att-status-badge att-status-late-early">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>Muộn & Về sớm</span>
      </span>
    `;
  }

  if (isLate) {
    return `
      <span class="att-status-badge att-status-late">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
        <span>Đi muộn</span>
      </span>
    `;
  }

  if (isEarly) {
    return `
      <span class="att-status-badge att-status-early">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <span>Về sớm</span>
      </span>
    `;
  }

  return `
    <span class="att-status-badge att-status-ontime">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      <span>Đúng giờ</span>
    </span>
  `;
}

/**
 * Tải danh sách nhân viên để phục vụ bộ lọc nhân sự (dành cho Admin / HR Manager)
 */
async function loadEmployeesForFilter() {
  const role = getCurrentUserRole();
  if (role !== ROLES.ADMIN && role !== ROLES.HR_MANAGER) {
    return;
  }

  try {
    const res = await employeeService.getEmployees({ page: 1, limit: 100 });
    state.employeesList = res.items || [];
  } catch (err) {
    console.warn('[AttendanceHistory] Không thể nạp danh sách nhân viên lọc:', err);
  }
}

/**
 * Gọi API lấy lịch sử chấm công từ Backend
 */
async function fetchHistoryData() {
  state.isLoading = true;
  state.error = null;
  renderDynamicSections();

  try {
    const params = {
      month: state.month,
      year: state.year,
      page: state.page,
      limit: state.limit,
    };

    if (state.employeeId && state.employeeId !== 'all') {
      params.employeeId = state.employeeId;
    }

    const res = await attendanceService.getAttendanceHistory(params);

    state.data = Array.isArray(res.data) ? res.data : [];
    state.summary = res.summary || { totalWorkDays: 0, lateCount: 0, earlyLeaveCount: 0 };
    state.pagination = res.pagination || {
      page: state.page,
      limit: state.limit,
      totalRecords: state.data.length,
      totalPages: 1,
    };
  } catch (err) {
    state.error = err.message || 'Không thể tải lịch sử chấm công. Vui lòng thử lại sau.';
    showToast(state.error, 'error');
  } finally {
    state.isLoading = false;
    renderDynamicSections();
  }
}

/**
 * Cập nhật lại các vùng giao diện động (Thống kê, Bảng, Phân trang) mà không cần render lại toàn bộ trang
 */
function renderDynamicSections() {
  const summaryContainer = qs('#history-summary-container');
  const tableContainer = qs('#history-table-container');

  if (summaryContainer) {
    summaryContainer.innerHTML = renderSummaryCardsHTML();
  }

  if (tableContainer) {
    tableContainer.innerHTML = renderTableAndPaginationHTML();
    bindTableEvents();
  }
}

/**
 * Sinh HTML cho 4 thẻ thống kê KPI
 * @returns {string}
 */
function renderSummaryCardsHTML() {
  const { totalWorkDays, lateCount, earlyLeaveCount } = state.summary;
  const onTimeCount = state.summary.onTimeCount !== undefined
    ? Number(state.summary.onTimeCount)
    : Math.max(0, totalWorkDays - lateCount);

  return `
    <div class="history-summary-grid">
      <!-- 1. Tổng ngày công -->
      <div class="summary-card card-workdays" id="card-total-workdays">
        <div class="summary-card-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
            <path d="m9 16 2 2 4-4"/>
          </svg>
        </div>
        <div class="summary-card-content">
          <div class="summary-card-label">Tổng ngày công</div>
          <div class="summary-card-value">${totalWorkDays}</div>
          <div class="summary-card-sub">Tháng ${state.month}/${state.year}</div>
        </div>
      </div>

      <!-- 2. Đúng giờ -->
      <div class="summary-card card-ontime" id="card-total-ontime">
        <div class="summary-card-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div class="summary-card-content">
          <div class="summary-card-label">Đi làm đúng giờ</div>
          <div class="summary-card-value" style="color: #059669;">${onTimeCount}</div>
          <div class="summary-card-sub">Đạt chuẩn vào ca</div>
        </div>
      </div>

      <!-- 3. Đi muộn -->
      <div class="summary-card card-late" id="card-total-late">
        <div class="summary-card-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 14 14"/>
          </svg>
        </div>
        <div class="summary-card-content">
          <div class="summary-card-label">Số lần đi muộn</div>
          <div class="summary-card-value" style="color: #d97706;">${lateCount}</div>
          <div class="summary-card-sub">Sau 08:30:00</div>
        </div>
      </div>

      <!-- 4. Về sớm -->
      <div class="summary-card card-early" id="card-total-early">
        <div class="summary-card-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </div>
        <div class="summary-card-content">
          <div class="summary-card-label">Số lần về sớm</div>
          <div class="summary-card-value" style="color: #7c3aed;">${earlyLeaveCount}</div>
          <div class="summary-card-sub">Trước 17:30:00</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Sinh HTML cho Bảng lịch sử chấm công, Trạng thái loading / rỗng / lỗi và Phân trang
 * @returns {string}
 */
function renderTableAndPaginationHTML() {
  // 1. Trạng thái Đang tải dữ liệu
  if (state.isLoading) {
    return `
      <div class="history-table-card">
        <div class="history-loading-spinner">
          <div class="spinner" style="width: 36px; height: 36px; border-width: 3px;"></div>
        </div>
      </div>
    `;
  }

  // 2. Trạng thái Lỗi API
  if (state.error) {
    return `
      <div class="history-table-card" style="padding: 24px;">
        <div class="history-error-card">
          <div class="history-error-icon">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div class="history-error-content">
            <div class="history-error-title">Không thể tải dữ liệu lịch sử chấm công</div>
            <p class="history-error-desc">${sanitizeHTML(state.error)}</p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-history-retry">
            Thử tải lại
          </button>
        </div>
      </div>
    `;
  }

  // 3. Trạng thái Không có bản ghi (Empty State)
  if (!state.data || state.data.length === 0) {
    return `
      <div class="history-table-card">
        <div class="history-table-header">
          <div class="history-table-title">
            <span>Chi tiết ngày làm việc</span>
            <span class="history-table-badge">0 bản ghi</span>
          </div>
        </div>
        <div class="history-empty-state">
          <div class="history-empty-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <h3 class="history-empty-title">Chưa có dữ liệu chấm công</h3>
          <p class="history-empty-desc">
            Không tìm thấy bản ghi chấm công nào trong Tháng ${state.month}/${state.year}. Vui lòng chọn tháng khác hoặc kiểm tra lại bộ lọc.
          </p>
        </div>
      </div>
    `;
  }

  // 4. Bảng dữ liệu chi tiết
  const role = getCurrentUserRole();
  const showEmployeeCol = (role === ROLES.ADMIN || role === ROLES.HR_MANAGER) && state.employeeId === 'all';
  const startIdx = (state.pagination.page - 1) * state.pagination.limit;

  const rowsHtml = state.data
    .map((item, index) => {
      const stt = startIdx + index + 1;
      const dateDisplay = formatDateDisplay(item.date);
      const { dayName, isWeekend } = getDayOfWeekInfo(item.date);
      const checkInDisplay = item.checkInTime ? formatTimeShort(item.checkInTime) : '--';
      const checkOutDisplay = item.checkOutTime ? formatTimeShort(item.checkOutTime) : (item.checkInTime ? '<span style="color: #94a3b8; font-style: italic;">Chưa check-out</span>' : '--');
      const statusBadge = renderStatusBadge(item);
      const noteDisplay = item.note ? sanitizeHTML(item.note) : '--';

      return `
        <tr data-id="${item.attendanceId}">
          <td style="text-align: center; color: #64748b; font-weight: 500;">${stt}</td>
          ${
            showEmployeeCol
              ? `
            <td>
              <div style="font-weight: 600; color: #1e293b;">${sanitizeHTML(item.employeeName || '--')}</div>
              <div style="font-size: 11px; color: #64748b;">${sanitizeHTML(item.employeeCode || '')} • ${sanitizeHTML(item.departmentName || '')}</div>
            </td>
          `
              : ''
          }
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="time-val" style="font-weight: 600;">${dateDisplay}</span>
            </div>
          </td>
          <td>
            <span class="date-day-badge ${isWeekend ? 'date-day-weekend' : ''}">${dayName}</span>
          </td>
          <td>
            <span class="time-val ${!item.checkInTime ? 'empty' : ''}">${checkInDisplay}</span>
          </td>
          <td>
            <span class="time-val ${!item.checkOutTime ? 'empty' : ''}">${checkOutDisplay}</span>
          </td>
          <td>
            ${statusBadge}
          </td>
          <td style="color: #64748b; font-size: 13px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${noteDisplay}">
            ${noteDisplay}
          </td>
        </tr>
      `;
    })
    .join('');

  // 5. Phân trang
  const { page, totalPages, totalRecords, limit } = state.pagination;
  const startRecord = (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, totalRecords);

  return `
    <div class="history-table-card">
      <div class="history-table-header">
        <div class="history-table-title">
          <span>Chi tiết ngày làm việc</span>
          <span class="history-table-badge">${totalRecords} bản ghi</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 13px; color: #64748b;">Hiển thị:</span>
          <select class="history-filter-select" id="history-limit-select" style="height: 32px; padding: 0 8px; font-size: 13px;">
            <option value="10" ${limit === 10 ? 'selected' : ''}>10 dòng</option>
            <option value="20" ${limit === 20 ? 'selected' : ''}>20 dòng</option>
            <option value="31" ${limit === 31 ? 'selected' : ''}>31 dòng</option>
          </select>
        </div>
      </div>

      <div class="table-responsive">
        <table class="history-table" id="attendance-history-table">
          <thead>
            <tr>
              <th style="width: 50px; text-align: center;">STT</th>
              ${showEmployeeCol ? '<th style="min-width: 180px;">Nhân viên</th>' : ''}
              <th style="width: 120px;">Ngày</th>
              <th style="width: 110px;">Thứ</th>
              <th style="width: 110px;">Giờ vào</th>
              <th style="width: 130px;">Giờ ra</th>
              <th style="width: 150px;">Trạng thái</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody id="history-table-body">
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <!-- PHÂN TRANG -->
      <div class="history-pagination">
        <div class="history-pagination-info">
          Hiển thị <strong>${startRecord} - ${endRecord}</strong> trên tổng số <strong>${totalRecords}</strong> bản ghi (Trang ${page}/${totalPages})
        </div>
        <div class="history-pagination-controls">
          <button type="button" class="btn-page" id="btn-page-prev" ${page <= 1 ? 'disabled' : ''} aria-label="Trang trước">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          
          <span style="padding: 0 8px; font-size: 13px; font-weight: 600; color: #1e293b;">
            ${page} / ${totalPages}
          </span>

          <button type="button" class="btn-page" id="btn-page-next" ${page >= totalPages ? 'disabled' : ''} aria-label="Trang tiếp theo">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Gắn sự kiện cho bảng và các nút phân trang
 */
function bindTableEvents() {
  const retryBtn = qs('#btn-history-retry');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => fetchHistoryData());
  }

  const limitSelect = qs('#history-limit-select');
  if (limitSelect) {
    limitSelect.addEventListener('change', (e) => {
      state.limit = Number(e.target.value);
      state.page = 1;
      fetchHistoryData();
    });
  }

  const prevBtn = qs('#btn-page-prev');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (state.page > 1) {
        state.page -= 1;
        fetchHistoryData();
      }
    });
  }

  const nextBtn = qs('#btn-page-next');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (state.page < state.pagination.totalPages) {
        state.page += 1;
        fetchHistoryData();
      }
    });
  }
}

/**
 * Render toàn bộ khung giao diện trang
 * @returns {string} HTML string
 */
export function renderAttendanceHistoryPage() {
  const role = getCurrentUserRole();
  const canFilterEmployee = role === ROLES.ADMIN || role === ROLES.HR_MANAGER;

  // Danh sách tháng 1 - 12
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
    .map((m) => `<option value="${m}" ${m === state.month ? 'selected' : ''}>Tháng ${m}</option>`)
    .join('');

  // Danh sách năm (năm hiện tại +- 1 năm)
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];
  const yearOptions = years
    .map((y) => `<option value="${y}" ${y === state.year ? 'selected' : ''}>Năm ${y}</option>`)
    .join('');

  // Danh sách nhân viên (nếu có quyền Admin/HR)
  let employeeFilterHtml = '';
  if (canFilterEmployee) {
    const employeeOptions = [
      '<option value="all">-- Tất cả nhân viên --</option>',
      ...state.employeesList.map(
        (emp) =>
          `<option value="${emp.employeeId}" ${String(emp.employeeId) === String(state.employeeId) ? 'selected' : ''}>${sanitizeHTML(emp.employeeCode)} - ${sanitizeHTML(emp.fullName)}</option>`
      ),
    ].join('');

    employeeFilterHtml = `
      <div class="history-filter-group group-employee">
        <label class="history-filter-label" for="history-employee-select">Nhân viên</label>
        <select class="history-filter-select" id="history-employee-select">
          ${employeeOptions}
        </select>
      </div>
    `;
  }

  const pageHeaderHtml = renderPageHeader({
    title: 'Lịch sử chấm công',
    subtitle: 'Theo dõi và tra cứu lịch sử chấm công theo tháng.',
    breadcrumbs: [
      { label: 'Trang chủ', path: '/dashboard' },
      { label: 'Chấm công', path: '/attendances' },
      { label: 'Lịch sử theo tháng' },
    ],
  });

  return `
    <div class="attendance-history-page">
      ${pageHeaderHtml}

      <!-- THANH ĐIỀU HƯỚNG TAB CHẤM CÔNG -->
      <div class="attendance-nav-tabs">
        <a href="/attendances" class="attendance-nav-tab" data-link>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Chấm công hôm nay</span>
        </a>
        <a href="/attendance-history" class="attendance-nav-tab active" data-link>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>Lịch sử theo tháng</span>
        </a>
      </div>

      <!-- BỘ LỌC THỜI GIAN & NHÂN SỰ -->
      <div class="history-filter-card">
        <form class="history-filter-form" id="history-filter-form" onsubmit="return false;">
          <!-- Chọn Tháng -->
          <div class="history-filter-group">
            <label class="history-filter-label" for="history-month-select">Tháng</label>
            <select class="history-filter-select" id="history-month-select">
              ${monthOptions}
            </select>
          </div>

          <!-- Chọn Năm -->
          <div class="history-filter-group">
            <label class="history-filter-label" for="history-year-select">Năm</label>
            <select class="history-filter-select" id="history-year-select">
              ${yearOptions}
            </select>
          </div>

          <!-- Chọn Nhân viên (nếu có quyền Admin/HR) -->
          ${employeeFilterHtml}

          <!-- Thao tác lọc -->
          <div class="history-filter-actions">
            <button type="button" class="btn-filter-submit" id="btn-submit-filter">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span>Xem lịch sử</span>
            </button>
            <button type="button" class="btn-filter-quick" id="btn-quick-this-month" title="Về tháng hiện tại">
              Tháng này
            </button>
          </div>
        </form>
      </div>

      <!-- CÁC THẺ THỐNG KÊ (KPI SUMMARY CARDS) -->
      <div id="history-summary-container">
        ${renderSummaryCardsHTML()}
      </div>

      <!-- BẢNG LỊCH SỬ CHẤM CÔNG CHI TIẾT & PHÂN TRANG -->
      <div id="history-table-container">
        ${renderTableAndPaginationHTML()}
      </div>
    </div>
  `;
}

/**
 * Khởi tạo sự kiện cho trang Lịch sử chấm công
 */
export async function initAttendanceHistoryPageEvents() {
  // 1. Tải danh sách nhân viên cho dropdown nếu là Admin/HR
  await loadEmployeesForFilter();

  // Cập nhật lại dropdown nhân viên nếu đã tải xong
  const employeeSelect = qs('#history-employee-select');
  if (employeeSelect && state.employeesList.length > 0) {
    const options = [
      '<option value="all">-- Tất cả nhân viên --</option>',
      ...state.employeesList.map(
        (emp) =>
          `<option value="${emp.employeeId}" ${String(emp.employeeId) === String(state.employeeId) ? 'selected' : ''}>${sanitizeHTML(emp.employeeCode)} - ${sanitizeHTML(emp.fullName)}</option>`
      ),
    ].join('');
    employeeSelect.innerHTML = options;
  }

  // 2. Gắn sự kiện cho nút "Xem lịch sử"
  const submitBtn = qs('#btn-submit-filter');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const monthSelect = qs('#history-month-select');
      const yearSelect = qs('#history-year-select');
      const empSelect = qs('#history-employee-select');

      if (monthSelect) state.month = Number(monthSelect.value);
      if (yearSelect) state.year = Number(yearSelect.value);
      if (empSelect) state.employeeId = empSelect.value;

      state.page = 1;
      fetchHistoryData();
    });
  }

  // 3. Nút chọn nhanh "Tháng này"
  const quickThisMonthBtn = qs('#btn-quick-this-month');
  if (quickThisMonthBtn) {
    quickThisMonthBtn.addEventListener('click', () => {
      const now = new Date();
      state.month = now.getMonth() + 1;
      state.year = now.getFullYear();

      const monthSelect = qs('#history-month-select');
      const yearSelect = qs('#history-year-select');
      if (monthSelect) monthSelect.value = state.month;
      if (yearSelect) yearSelect.value = state.year;

      state.page = 1;
      fetchHistoryData();
    });
  }

  // 4. Gắn sự kiện ban đầu cho bảng & phân trang
  bindTableEvents();

  // 5. Tự động tải dữ liệu tháng hiện tại khi mở trang
  fetchHistoryData();
}

export default {
  render: renderAttendanceHistoryPage,
  initEvents: initAttendanceHistoryPageEvents,
};
