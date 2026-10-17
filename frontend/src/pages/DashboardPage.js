import { renderPageHeader } from '../components/PageHeader.js';
import { api } from '../services/api.js';
import { showToast } from '../components/Toast.js';
import { qs, sanitizeHTML } from '../utils/dom.js';
import { renderAttendanceWidgetMarkup, initAttendanceWidgetEvents, destroyAttendanceWidget, formatTimeDisplay } from '../components/AttendanceWidget.js';
import { attendanceService } from '../services/attendanceService.js';
import { dashboardService } from '../services/dashboardService.js';
import {
  renderDepartmentDistributionChartMarkup,
  updateDepartmentDistributionChart,
  renderDepartmentDistributionError,
} from '../components/DepartmentDistributionChart.js';
import { getCurrentUser, getCurrentUserRole } from '../services/authService.js';
import { ROLES } from '../utils/rbac.js';
import { openEmployeeDetailModal } from '../components/EmployeeDetailModal.js';

export function renderDashboardPage() {
  const userRole = getCurrentUserRole();
  const isEmployee = userRole === ROLES.EMPLOYEE;
  const currentUser = getCurrentUser();

  // ============================================================================
  // GIAO DIỆN TỔNG QUAN DÀNH CHO NHÂN VIÊN (TÙY BIẾN DASHBOARD CÁ NHÂN)
  // Chỉ hiển thị: Widget chấm công, Số ngày công tích lũy trong tháng, Hồ sơ cá nhân
  // Ẩn toàn bộ: Chỉ số toàn công ty, Sức khỏe hạ tầng Docker, Bảng chấm công công ty
  // ============================================================================
  if (isEmployee) {
    const fullName = currentUser?.fullName || currentUser?.username || 'Nhân viên';
    const initials = fullName
      .split(' ')
      .filter(Boolean)
      .slice(-2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || 'NV';

    const empCode = currentUser?.employeeCode || `NV${String(currentUser?.employeeId || '003').padStart(3, '0')}`;
    const departmentName = currentUser?.departmentName || 'Phòng Kỹ thuật & CNTT';
    const position = currentUser?.position || 'Kỹ sư Phần mềm';
    const email = currentUser?.email || (currentUser?.username ? `${currentUser.username}@company.com` : 'employee@company.com');
    const phone = currentUser?.phone || '0988 123 456';

    const headerHtml = renderPageHeader({
      title: `Xin chào, ${sanitizeHTML(fullName)}!`,
      subtitle: 'Bảng điều khiển cá nhân: Theo dõi thời gian làm việc, chấm công và hồ sơ của bạn',
      breadcrumbs: [{ label: 'Trang chủ', path: '/dashboard' }, { label: 'Tổng quan cá nhân' }],
      actions: `
        <button class="btn btn-secondary" id="btn-refresh-stats">
          <svg viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          <span>Làm mới</span>
        </button>
      `,
    });

    return `
      ${headerHtml}

      <!-- 1. Widget Chấm công thời gian thực Check-in / Check-out cá nhân -->
      ${renderAttendanceWidgetMarkup()}

      <!-- 2. Thẻ thống kê chấm công cá nhân -->
      <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));">
        <div class="stat-card">
          <div class="stat-info">
            <span class="stat-label">Số ngày công tích lũy trong tháng</span>
            <span class="stat-value" id="emp-monthly-days">--</span>
            <span class="stat-meta">
              <span class="badge badge-success" id="emp-monthly-badge">Tháng hiện tại</span>
            </span>
          </div>
          <div class="stat-icon icon-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-info">
            <span class="stat-label">Tỷ lệ đúng giờ tháng này</span>
            <span class="stat-value" id="emp-ontime-rate">--%</span>
            <span class="stat-meta">
              <span class="badge badge-info" id="emp-ontime-badge">Tính trên ngày công</span>
            </span>
          </div>
          <div class="stat-icon icon-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-info">
            <span class="stat-label">Trạng thái công hôm nay</span>
            <span class="stat-value" id="emp-today-status" style="font-size: 1.15rem; margin-top: 6px;">Đang tải...</span>
            <span class="stat-meta">
              <span class="badge badge-secondary" id="emp-today-meta">Ca làm việc tiêu chuẩn</span>
            </span>
          </div>
          <div class="stat-icon icon-purple">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
        </div>
      </div>

      <!-- 3. Thẻ Hồ sơ cá nhân của nhân viên (Personal Profile Card) -->
      <div class="card personal-profile-card" style="margin-top: var(--space-6);">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h2 class="card-title">Hồ sơ nhân viên của tôi</h2>
            <p style="font-size: 12px; color: var(--color-text-muted); margin: 2px 0 0 0;">Thông tin cá nhân và vị trí phòng ban được ghi nhận trên hệ thống</p>
          </div>
          <button class="btn btn-sm btn-secondary" id="btn-view-my-profile">
            <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; margin-right: 4px;"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>Xem chi tiết hồ sơ</span>
          </button>
        </div>
        <div class="card-body">
          <div class="personal-profile-grid">
            <div class="personal-profile-left">
              <div class="personal-avatar">${initials}</div>
              <div class="personal-basic">
                <div class="personal-name">${sanitizeHTML(fullName)}</div>
                <div class="personal-code">Mã NV: <strong>${sanitizeHTML(empCode)}</strong></div>
                <span class="badge badge-success" style="margin-top: 6px; width: fit-content;">Đang làm việc</span>
              </div>
            </div>
            <div class="personal-profile-details">
              <div class="profile-info-row">
                <span class="profile-info-label">Phòng ban:</span>
                <span class="profile-info-val"><strong>${sanitizeHTML(departmentName)}</strong></span>
              </div>
              <div class="profile-info-row">
                <span class="profile-info-label">Chức danh / Vị trí:</span>
                <span class="profile-info-val">${sanitizeHTML(position)}</span>
              </div>
              <div class="profile-info-row">
                <span class="profile-info-label">Email công vụ:</span>
                <span class="profile-info-val"><a href="mailto:${sanitizeHTML(email)}" style="color: var(--color-primary);">${sanitizeHTML(email)}</a></span>
              </div>
              <div class="profile-info-row">
                <span class="profile-info-label">Số điện thoại:</span>
                <span class="profile-info-val">${sanitizeHTML(phone)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // GIAO DIỆN TỔNG QUAN DÀNH CHO QUẢN TRỊ VIÊN & QUẢN LÝ NHÂN SỰ (ADMIN / HR)
  // ============================================================================
  const headerHtml = renderPageHeader({
    title: 'Tổng quan hệ thống',
    subtitle: 'Theo dõi các chỉ số nhân sự, phòng ban và chấm công thời gian thực',
    breadcrumbs: [{ label: 'Trang chủ', path: '/dashboard' }, { label: 'Tổng quan' }],
    actions: `
      <button class="btn btn-secondary" id="btn-refresh-stats">
        <svg viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        <span>Làm mới</span>
      </button>
      <a href="/attendances" class="btn btn-primary" data-link>
        <svg viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
        <span>Chấm công hôm nay</span>
      </a>
    `,
  });

  return `
    ${headerHtml}

    <!-- Widget Chấm công thời gian thực Check-in / Check-out -->
    ${renderAttendanceWidgetMarkup()}

    <!-- 3 Thẻ chỉ số thống kê KPI tổng quan (HRM-212) -->
    <div class="stats-grid kpi-3-cards" id="dash-kpi-grid">
      <!-- Thẻ 1: Tổng nhân sự -->
      <div class="stat-card kpi-card" id="card-total-employees">
        <div class="stat-info">
          <span class="stat-label" data-key="total-employees" aria-label="Tổng số nhân sự">Tổng nhân sự</span>
          <span class="stat-value" id="kpi-total-employees">--</span>
          <span class="stat-meta" id="kpi-total-employees-meta">
            <span class="badge badge-info">Đang tải...</span>
            <span class="sr-only" style="display:none">Tổng số nhân sự</span>
          </span>
        </div>
        <div class="stat-icon icon-blue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
      </div>

      <!-- Thẻ 2: Tổng phòng ban -->
      <div class="stat-card kpi-card" id="card-total-departments">
        <div class="stat-info">
          <span class="stat-label" data-key="total-departments" aria-label="Phòng ban hoạt động">Tổng phòng ban</span>
          <span class="stat-value" id="kpi-total-departments">--</span>
          <span class="stat-meta" id="kpi-total-departments-meta">
            <span class="badge badge-info">Đang tải...</span>
            <span class="sr-only" style="display:none">Phòng ban hoạt động</span>
          </span>
        </div>
        <div class="stat-icon icon-purple">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="16" height="20" x="4" y="2" rx="2" ry="2"/>
            <path d="M9 22v-4h6v4"/>
            <path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/>
            <path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/>
            <path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>
          </svg>
        </div>
      </div>

      <!-- Thẻ 3: Có mặt hôm nay -->
      <div class="stat-card kpi-card" id="card-attendance-rate">
        <div class="stat-info">
          <span class="stat-label" data-key="attendance-rate">Có mặt hôm nay</span>
          <span class="stat-value" id="kpi-attendance-rate">--%</span>
          <span class="stat-meta" id="kpi-attendance-meta">
            <span class="badge badge-info">Đang tải...</span>
          </span>
        </div>
        <div class="stat-icon icon-green">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 2v4"/><path d="M16 2v4"/>
            <rect width="18" height="18" x="3" y="4" rx="2"/>
            <path d="M3 10h18"/>
            <path d="m9 16 2 2 4-4"/>
          </svg>
        </div>
      </div>
    </div>

    <!-- Khu vực Biểu đồ phân bổ nhân sự theo phòng ban (HRM-212) -->
    ${renderDepartmentDistributionChartMarkup()}

    <!-- Layout 2 cột: Hoạt động gần đây + Trạng thái Backend Live -->
    <div class="dashboard-grid">
      <!-- Cột 1: Danh sách chấm công gần nhất -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Nhật ký chấm công hôm nay</h2>
          <a href="/attendances" class="badge badge-blue" data-link style="text-decoration: none;">Xem bảng đầy đủ →</a>
        </div>
        <div class="card-body">
          <div class="activity-list" id="dash-activity-list">
            <div class="loading-container" style="padding: 1rem 0;">
              <div class="spinner"></div>
              <span>Đang tải nhật ký chấm công hôm nay...</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Cột 2: Trạng thái kết nối Backend & CSDL thời gian thực -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Sức khỏe Hạ tầng Docker</h2>
          <span class="badge badge-info" id="db-health-badge">Đang kiểm tra...</span>
        </div>
        <div class="card-body" id="backend-status-card">
          <p style="font-size: 13px; color: #64748b; margin-bottom: 12px;">
            Hệ thống đang tự động kiểm tra endpoint <code>/api/health/db</code> kết nối tới MySQL 8.0:
          </p>
          <div id="backend-status-details" style="font-size: 12px; line-height: 1.8; color: #334155;">
            Đang truy vấn trạng thái kết nối máy chủ...
          </div>
        </div>
      </div>
    </div>
  `;
}

export function initDashboardPageEvents() {
  const userRole = getCurrentUserRole();
  const isEmployee = userRole === ROLES.EMPLOYEE;
  const currentUser = getCurrentUser();

  // 1. Khởi tạo Widget Chấm công thời gian thực cho mọi vai trò
  initAttendanceWidgetEvents();

  // 2. Gắn sự kiện nút Làm mới
  const refreshBtn = qs('#btn-refresh-stats');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      showToast('Đang cập nhật số liệu tổng quan...', 'info');
      initAttendanceWidgetEvents();

      if (isEmployee) {
        loadEmployeeDashboardStatus();
      } else {
        loadDashboardKpiAndDistribution();
        checkLiveBackendStatus();
        loadLiveDashboardAttendance();
      }
    });
  }

  // 3. Phân nhánh hành vi theo vai trò
  if (isEmployee) {
    // Tải trạng thái công hôm nay của nhân viên
    loadEmployeeDashboardStatus();

    // Gắn sự kiện mở modal xem chi tiết hồ sơ cá nhân
    const viewProfileBtn = qs('#btn-view-my-profile');
    if (viewProfileBtn) {
      viewProfileBtn.addEventListener('click', () => {
        openEmployeeDetailModal(currentUser?.employeeId, viewProfileBtn);
      });
    }
  } else {
    // Tải 3 KPI và Biểu đồ phân bổ nhân sự cho Quản trị viên & HR
    loadDashboardKpiAndDistribution();

    // Tự động kiểm tra trạng thái Backend & MySQL live cho Quản trị viên
    checkLiveBackendStatus();

    // Tải dữ liệu nhật ký và KPI chấm công hôm nay toàn công ty
    loadLiveDashboardAttendance();
  }
}

/**
 * Tải 3 chỉ số KPI và biểu đồ phân bổ nhân sự theo phòng ban
 */
export async function loadDashboardKpiAndDistribution() {
  const kpiTotalEmp = qs('#kpi-total-employees');
  const kpiTotalEmpMeta = qs('#kpi-total-employees-meta');
  const kpiTotalDept = qs('#kpi-total-departments');
  const kpiTotalDeptMeta = qs('#kpi-total-departments-meta');
  const kpiAttRate = qs('#kpi-attendance-rate');
  const kpiAttMeta = qs('#kpi-attendance-meta');
  const chartBody = qs('#dept-chart-body');

  let totalWorkingEmployees = null;

  // 1. Tải 3 thẻ thống kê KPI thực tế từ GET /api/dashboard/stats
  try {
    if (kpiTotalEmp) kpiTotalEmp.textContent = '--';
    if (kpiTotalDept) kpiTotalDept.textContent = '--';
    if (kpiAttRate) kpiAttRate.textContent = '--%';

    const stats = await dashboardService.getDashboardStats();
    totalWorkingEmployees = stats.totalEmployees;

    if (kpiTotalEmp) {
      kpiTotalEmp.textContent = stats.totalEmployees;
    }
    if (kpiTotalEmpMeta) {
      kpiTotalEmpMeta.innerHTML = `
        <span class="badge badge-success">Nhân viên đang làm việc</span>
        <span class="sr-only" style="display:none">Tổng số nhân sự</span>
      `;
    }

    if (kpiTotalDept) {
      kpiTotalDept.textContent = stats.totalDepartments;
    }
    if (kpiTotalDeptMeta) {
      kpiTotalDeptMeta.innerHTML = `
        <span class="badge badge-purple">Phòng ban đang hoạt động</span>
        <span class="sr-only" style="display:none">Phòng ban hoạt động</span>
      `;
    }

    if (kpiAttRate) {
      kpiAttRate.textContent = `${stats.attendanceRate}%`;
    }
    if (kpiAttMeta) {
      const badgeCls = stats.attendanceRate >= 80 ? 'badge-success' : (stats.attendanceRate > 0 ? 'badge-warning' : 'badge-secondary');
      kpiAttMeta.innerHTML = `
        <span class="badge ${badgeCls}">${stats.presentEmployees}/${stats.totalEmployees} nhân viên</span>
      `;
    }
  } catch (err) {
    console.warn('[DashboardPage] Không thể tải dữ liệu KPI Dashboard:', err?.message);
    if (kpiTotalEmp) kpiTotalEmp.textContent = '--';
    if (kpiTotalDept) kpiTotalDept.textContent = '--';
    if (kpiAttRate) kpiAttRate.textContent = '--%';

    if (kpiTotalEmpMeta) {
      kpiTotalEmpMeta.innerHTML = `
        <span class="badge badge-danger">Lỗi tải dữ liệu</span>
        <button class="btn-retry-kpi" id="btn-retry-kpi-1">Thử lại</button>
      `;
    }
    if (kpiTotalDeptMeta) {
      kpiTotalDeptMeta.innerHTML = `
        <span class="badge badge-danger">Lỗi tải dữ liệu</span>
        <button class="btn-retry-kpi" id="btn-retry-kpi-2">Thử lại</button>
      `;
    }
    if (kpiAttMeta) {
      kpiAttMeta.innerHTML = `
        <span class="badge badge-danger">Lỗi tải dữ liệu</span>
        <button class="btn-retry-kpi" id="btn-retry-kpi-3">Thử lại</button>
      `;
    }

    ['#btn-retry-kpi-1', '#btn-retry-kpi-2', '#btn-retry-kpi-3'].forEach((sel) => {
      const btn = qs(sel);
      if (btn) {
        btn.addEventListener('click', () => loadDashboardKpiAndDistribution());
      }
    });
  }

  // 2. Tải biểu đồ phân bổ nhân sự theo từng phòng ban
  try {
    if (chartBody) {
      chartBody.innerHTML = `
        <div class="loading-container" style="padding: 2.5rem 0;">
          <div class="spinner"></div>
          <span>Đang tải số liệu phân bổ nhân sự...</span>
        </div>
      `;
    }

    const distribution = await dashboardService.getDepartmentDistribution(totalWorkingEmployees);

    if (chartBody) {
      updateDepartmentDistributionChart(chartBody, distribution);
    }
  } catch (err) {
    console.warn('[DashboardPage] Không thể tải biểu đồ phân bổ nhân sự:', err?.message);
    if (chartBody) {
      renderDepartmentDistributionError(chartBody, err.message, () => loadDashboardKpiAndDistribution());
    }
  }
}

/**
 * Tải trạng thái công hôm nay của nhân viên phục vụ Dashboard cá nhân
 */
async function loadEmployeeDashboardStatus() {
  const statusEl = qs('#emp-today-status');
  const metaEl = qs('#emp-today-meta');
  if (!statusEl) return;

  try {
    const res = await attendanceService.getTodayAttendance();
    const currentUser = getCurrentUser();
    const record = attendanceService.extractPersonalRecord(res, currentUser?.employeeId);

    if (record && record.checkInTime) {
      const isLate = record.status === 'LATE';
      const inTime = formatTimeDisplay(record.checkInTime);

      if (record.checkOutTime) {
        const outTime = formatTimeDisplay(record.checkOutTime);
        statusEl.innerHTML = `<span style="color: #0284c7; font-weight: 700;">Đã hoàn thành</span>`;
        if (metaEl) {
          metaEl.className = 'badge badge-info';
          metaEl.textContent = `${inTime} - ${outTime}`;
        }
      } else {
        const color = isLate ? '#d97706' : '#10b981';
        const label = isLate ? 'Đi muộn' : 'Đúng giờ';
        statusEl.innerHTML = `<span style="color: ${color}; font-weight: 700;">Đang làm việc</span>`;
        if (metaEl) {
          metaEl.className = isLate ? 'badge badge-warning' : 'badge badge-success';
          metaEl.textContent = `Check-in ${inTime} (${label})`;
        }
      }
    } else {
      statusEl.innerHTML = `<span style="color: #64748b; font-weight: 600;">Chưa check-in</span>`;
      if (metaEl) {
        metaEl.className = 'badge badge-secondary';
        metaEl.textContent = 'Ca làm việc 08:30';
      }
    }
  } catch (err) {
    console.warn('[DashboardPage] Không thể tải trạng thái công cá nhân:', err?.message);
    if (statusEl) {
      statusEl.textContent = 'Chưa ghi nhận';
    }
  }
}

async function loadLiveDashboardAttendance() {
  const activityList = qs('#dash-activity-list');
  if (!activityList) return;

  try {
    const res = await attendanceService.getTodayAttendance();
    let records = [];

    if (Array.isArray(res.data)) {
      records = res.data;
    } else if (res.data && typeof res.data === 'object') {
      records = [res.data];
    }

    const activeRows = records.filter((r) => Boolean(r.checkInTime));
    if (activeRows.length === 0) {
      activityList.innerHTML = `
        <div style="text-align: center; color: #94a3b8; font-size: 13px; padding: 1.5rem 0;">
          Chưa có nhân viên nào check-in hôm nay.
        </div>
      `;
    } else {
      activityList.innerHTML = activeRows.slice(0, 5).map((row) => {
        const initials = (row.fullName || 'NV').slice(0, 2).toUpperCase();
        const isLate = row.status === 'LATE';
        const time = formatTimeDisplay(row.checkInTime);
        const badgeClass = isLate ? 'badge-warning' : 'badge-success';
        const badgeText = isLate ? 'Đi muộn' : 'Đúng giờ';

        return `
          <div class="activity-item">
            <div class="activity-avatar">${initials}</div>
            <div class="activity-content">
              <div class="activity-title">${sanitizeHTML(row.fullName || 'Nhân viên')}</div>
              <div class="activity-time">Check-in lúc ${time} • ${sanitizeHTML(row.departmentName || 'Nhân sự')}</div>
            </div>
            <span class="badge ${badgeClass}">${badgeText}</span>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.warn('[DashboardPage] Không thể tải dữ liệu chấm công cho dashboard:', err?.message);
  }
}

async function checkLiveBackendStatus() {
  const badge = qs('#db-health-badge');
  const details = qs('#backend-status-details');
  if (!badge || !details) return;

  try {
    const res = await api.checkDbHealth();
    if (res.status === 'success') {
      badge.textContent = 'ONLINE (Healthy)';
      badge.className = 'badge badge-success';
      details.innerHTML = `
        <div>🟢 <strong>Trạng thái CSDL:</strong> ${res.data.databaseStatus}</div>
        <div>🏷️ <strong>Tên Database:</strong> <code>${res.data.databaseName}</code></div>
        <div>⚡ <strong>Độ trễ truy vấn:</strong> ${res.data.latencyMs}ms</div>
        <div>🐬 <strong>Phiên bản MySQL:</strong> ${res.data.mysqlVersion}</div>
        <div>📋 <strong>Số bảng nhận diện:</strong> ${res.data.detectedTables?.length || 4} bảng</div>
      `;
    }
  } catch (err) {
    badge.textContent = 'OFFLINE';
    badge.className = 'badge badge-danger';
    details.innerHTML = `
      <div style="color: #ef4444;">🔴 Chưa thể kết nối Backend (Port 3005).</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
        Vui lòng đảm bảo container <code>hrm-ictu-backend</code> đang chạy qua Docker Compose.
      </div>
    `;
  }
}

export default {
  render: renderDashboardPage,
  initEvents: initDashboardPageEvents,
  destroy: destroyAttendanceWidget,
};
