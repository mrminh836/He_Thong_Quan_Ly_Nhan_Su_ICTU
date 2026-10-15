import { renderPageHeader } from '../components/PageHeader.js';
import { api } from '../services/api.js';
import { showToast } from '../components/Toast.js';
import { qs, sanitizeHTML } from '../utils/dom.js';
import { renderAttendanceWidgetMarkup, initAttendanceWidgetEvents, destroyAttendanceWidget, formatTimeDisplay } from '../components/AttendanceWidget.js';
import { attendanceService } from '../services/attendanceService.js';
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

      <!-- 1. Widget Chấm công của tôi (Check-in / Check-out thời gian thực) -->
      ${renderAttendanceWidgetMarkup()}

      <!-- 2. Thống kê công tích lũy trong tháng & Trạng thái làm việc -->
      <div class="stats-grid employee-stats-grid">
        <!-- Card 1: Số ngày công tích lũy trong tháng -->
        <div class="stat-card">
          <div class="stat-info">
            <span class="stat-label">Số ngày công tích lũy trong tháng</span>
            <span class="stat-value" id="emp-monthly-days">22 / 24 <small style="font-size: 14px; font-weight: 500; color: #64748b;">ngày</small></span>
            <span class="stat-meta">
              <span class="badge badge-success">Đạt 91.6% kế hoạch</span>
              <span style="font-size: 11px; color: #64748b;">Tháng 10/2026</span>
            </span>
          </div>
          <div class="stat-icon icon-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
          </div>
        </div>

        <!-- Card 2: Tỷ lệ đúng giờ tháng này -->
        <div class="stat-card">
          <div class="stat-info">
            <span class="stat-label">Tỷ lệ đúng giờ tháng này</span>
            <span class="stat-value" id="emp-ontime-rate">95%</span>
            <span class="stat-meta">
              <span class="badge badge-success">19/20 ca chuẩn giờ</span>
              <span style="font-size: 11px; color: #64748b;">Ghi nhận trước 08:30</span>
            </span>
          </div>
          <div class="stat-icon icon-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>

        <!-- Card 3: Trạng thái công hôm nay -->
        <div class="stat-card">
          <div class="stat-info">
            <span class="stat-label">Trạng thái công hôm nay</span>
            <span class="stat-value" id="emp-today-status" style="font-size: 1.25rem;">Đang tải...</span>
            <span class="stat-meta">
              <span class="badge badge-info" id="emp-today-meta">Hôm nay</span>
            </span>
          </div>
          <div class="stat-icon icon-purple">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
        </div>

        <!-- Card 4: Ca làm việc tiêu chuẩn -->
        <div class="stat-card">
          <div class="stat-info">
            <span class="stat-label">Ca làm việc tiêu chuẩn</span>
            <span class="stat-value" style="font-size: 1.25rem;">08:30 - 17:30</span>
            <span class="stat-meta">
              <span class="badge badge-secondary">8 giờ / ca</span>
              <span style="font-size: 11px; color: #64748b;">Nghỉ trưa 12:00 - 13:00</span>
            </span>
          </div>
          <div class="stat-icon icon-orange">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          </div>
        </div>
      </div>

      <!-- 3. Khối Hồ sơ cá nhân của nhân viên -->
      <div class="personal-profile-card">
        <div class="personal-profile-header">
          <h2 class="personal-profile-title">
            <svg viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>Hồ sơ nhân viên của tôi</span>
          </h2>
          <button class="btn btn-secondary btn-sm" id="btn-view-my-profile" type="button">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>Xem hồ sơ chi tiết</span>
          </button>
        </div>

        <div class="personal-profile-body">
          <div class="personal-profile-avatar-col">
            <div class="personal-profile-avatar">${sanitizeHTML(initials)}</div>
            <div class="personal-profile-name">${sanitizeHTML(fullName)}</div>
            <div class="personal-profile-role">${sanitizeHTML(position)}</div>
            <span class="badge badge-success" style="margin-top: 8px;">Đang làm việc</span>
          </div>

          <div class="personal-profile-grid">
            <div class="personal-profile-field">
              <span class="personal-profile-field-label">Mã nhân viên</span>
              <span class="personal-profile-field-value">
                <span class="emp-code-badge" style="display: inline-block;">${sanitizeHTML(empCode)}</span>
              </span>
            </div>

            <div class="personal-profile-field">
              <span class="personal-profile-field-label">Phòng ban trực thuộc</span>
              <span class="personal-profile-field-value">${sanitizeHTML(departmentName)}</span>
            </div>

            <div class="personal-profile-field">
              <span class="personal-profile-field-label">Email công việc</span>
              <span class="personal-profile-field-value">${sanitizeHTML(email)}</span>
            </div>

            <div class="personal-profile-field">
              <span class="personal-profile-field-label">Số điện thoại</span>
              <span class="personal-profile-field-value">${sanitizeHTML(phone)}</span>
            </div>

            <div class="personal-profile-field">
              <span class="personal-profile-field-label">Chức vụ chuyên môn</span>
              <span class="personal-profile-field-value">${sanitizeHTML(position)}</span>
            </div>

            <div class="personal-profile-field">
              <span class="personal-profile-field-label">Trạng thái tài khoản</span>
              <span class="personal-profile-field-value">
                <span style="color: #10b981; font-weight: 600;">● Hoạt động</span> (Vai trò: Nhân viên)
              </span>
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

    <!-- Thẻ chỉ số tổng quan (KPIs) -->
    <div class="stats-grid">
      <!-- Card 1 -->
      <div class="stat-card">
        <div class="stat-info">
          <span class="stat-label">Tổng số nhân sự</span>
          <span class="stat-value">5</span>
          <span class="stat-meta">
            <span class="badge badge-success">+2 nhân sự mới</span>
            <span class="badge badge-mock">Mock data</span>
          </span>
        </div>
        <div class="stat-icon icon-blue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
      </div>

      <!-- Card 2 -->
      <div class="stat-card">
        <div class="stat-info">
          <span class="stat-label">Phòng ban hoạt động</span>
          <span class="stat-value">3</span>
          <span class="stat-meta">
            <span>Toàn công ty</span>
            <span class="badge badge-mock">Mock data</span>
          </span>
        </div>
        <div class="stat-icon icon-purple">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/></svg>
        </div>
      </div>

      <!-- Card 3 -->
      <div class="stat-card">
        <div class="stat-info">
          <span class="stat-label">Đi làm đúng giờ hôm nay</span>
          <span class="stat-value" id="dash-ontime-val">-- / --</span>
          <span class="stat-meta">
            <span class="badge badge-success" id="dash-ontime-pct">Đang tải...</span>
          </span>
        </div>
        <div class="stat-icon icon-green">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      </div>

      <!-- Card 4 -->
      <div class="stat-card">
        <div class="stat-info">
          <span class="stat-label">Đi muộn hôm nay</span>
          <span class="stat-value" id="dash-late-val">--</span>
          <span class="stat-meta">
            <span class="badge badge-warning" id="dash-late-badge">Ghi nhận sau 08:30</span>
          </span>
        </div>
        <div class="stat-icon icon-orange">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
      </div>
    </div>

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
    // Tự động kiểm tra trạng thái Backend & MySQL live cho Quản trị viên
    checkLiveBackendStatus();

    // Tải dữ liệu nhật ký và KPI chấm công hôm nay toàn công ty
    loadLiveDashboardAttendance();
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
  const ontimeVal = qs('#dash-ontime-val');
  const ontimePct = qs('#dash-ontime-pct');
  const lateVal = qs('#dash-late-val');
  const activityList = qs('#dash-activity-list');

  try {
    const res = await attendanceService.getTodayAttendance();
    let records = [];

    if (Array.isArray(res.data)) {
      records = res.data;
    } else if (res.data && typeof res.data === 'object') {
      records = [res.data];
    }

    const summary = attendanceService.calculateAttendanceSummary(records, res.summary);

    if (ontimeVal) {
      ontimeVal.textContent = `${summary.onTime} / ${summary.totalEmployees}`;
    }
    if (ontimePct) {
      const pct = summary.totalEmployees > 0
        ? Math.round((summary.onTime / summary.totalEmployees) * 100)
        : 0;
      ontimePct.textContent = `${pct}% Đúng giờ`;
    }
    if (lateVal) {
      lateVal.textContent = summary.late;
    }

    if (activityList) {
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
                <div class="activity-title">${row.fullName || 'Nhân viên'}</div>
                <div class="activity-time">Check-in lúc ${time} • ${row.departmentName || 'Nhân sự'}</div>
              </div>
              <span class="badge ${badgeClass}">${badgeText}</span>
            </div>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.warn('[DashboardPage] Không thể tải dữ liệu chấm công cho dashboard:', err);
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
        <div>⚡ <strong>Độ trễ truy vấn:</strong> ${res.data.latencyMs}</div>
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
