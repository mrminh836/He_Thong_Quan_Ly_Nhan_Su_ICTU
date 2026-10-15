import { renderPageHeader } from '../components/PageHeader.js';
import { api } from '../services/api.js';
import { showToast } from '../components/Toast.js';
import { qs } from '../utils/dom.js';
import { renderAttendanceWidgetMarkup, initAttendanceWidgetEvents, destroyAttendanceWidget, formatTimeDisplay } from '../components/AttendanceWidget.js';
import { attendanceService } from '../services/attendanceService.js';

export function renderDashboardPage() {
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
  // 1. Khởi tạo Widget Chấm công thời gian thực & tải dữ liệu hôm nay
  initAttendanceWidgetEvents();

  const refreshBtn = qs('#btn-refresh-stats');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      showToast('Đang cập nhật số liệu tổng quan...', 'info');
      checkLiveBackendStatus();
      initAttendanceWidgetEvents();
      loadLiveDashboardAttendance();
    });
  }

  // Tự động kiểm tra trạng thái Backend & MySQL live
  checkLiveBackendStatus();

  // Tải dữ liệu nhật ký và KPI chấm công hôm nay trực tiếp từ API
  loadLiveDashboardAttendance();
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
