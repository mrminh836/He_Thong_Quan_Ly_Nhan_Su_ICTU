import { attendanceService } from '../services/attendanceService.js';
import { getCurrentUser } from '../services/authService.js';
import { showToast } from './Toast.js';
import { qs } from '../utils/dom.js';

/**
 * Biến lưu trữ trạng thái và Interval của Đồng hồ thời gian thực
 */
let clockIntervalId = null;
let currentAttendanceData = null;
let isSubmitting = false;
let isLoadingData = false;
let loadError = null;

const VIETNAM_DAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/**
 * Lấy các thành phần ngày/giờ hiện tại theo múi giờ Việt Nam (Asia/Ho_Chi_Minh)
 * @param {Date} [date=new Date()]
 * @returns {{ timeStr: string, dateStr: string, dayOfWeek: string }}
 */
export function getVietnamClockParts(date = new Date()) {
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});

  // Xác định thứ trong tuần theo giờ Việt Nam
  const vnDateObj = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const dayOfWeek = VIETNAM_DAYS[vnDateObj.getDay()];

  const timeStr = timeFormatter.format(date);
  const dateStr = `${dayOfWeek}, ngày ${parts.day} tháng ${parts.month} năm ${parts.year}`;

  return { timeStr, dateStr, dayOfWeek };
}

/**
 * Trích xuất định dạng giờ hiển thị HH:mm:ss từ chuỗi thời gian hoặc ISO datetime
 * @param {string|null} isoOrTimeStr
 * @returns {string} Giờ dạng HH:mm:ss hoặc '--:--'
 */
export function formatTimeDisplay(isoOrTimeStr) {
  if (!isoOrTimeStr) return '--:--';

  if (typeof isoOrTimeStr === 'string') {
    // Nếu có đuôi Z (UTC), chuyển đổi sang múi giờ Asia/Ho_Chi_Minh
    if (isoOrTimeStr.endsWith('Z')) {
      try {
        const d = new Date(isoOrTimeStr);
        if (!isNaN(d.getTime())) {
          return new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          }).format(d);
        }
      } catch (e) {
        // Fallback tiếp tục bên dưới
      }
    }

    // Nếu có dạng T... (ví dụ: 2026-10-16T08:25:00+07:00)
    if (isoOrTimeStr.includes('T')) {
      const match = isoOrTimeStr.match(/T(\d{2}:\d{2}(?::\d{2})?)/);
      if (match) {
        const t = match[1];
        return t.length === 5 ? `${t}:00` : t.slice(0, 8);
      }
    }

    const clean = isoOrTimeStr.trim();
    if (clean.length === 5) return `${clean}:00`;
    return clean.slice(0, 8);
  }

  if (isoOrTimeStr instanceof Date) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(isoOrTimeStr);
  }

  return '--:--';
}

/**
 * Tính toán trạng thái hiển thị của Widget dựa trên dữ liệu chấm công thực tế
 * @param {object|null} record - Bản ghi chấm công hôm nay
 * @returns {object} Thông tin trạng thái, badge, guidance và button
 */
export function computeWidgetState(record) {
  // 1. Chưa có dữ liệu chấm công hôm nay
  if (!record || !record.checkInTime) {
    return {
      statusType: 'NOT_CHECKED_IN',
      badgeHtml: `
        <span class="att-badge att-badge-neutral">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
          Chưa check-in
        </span>
      `,
      guidanceText: 'Bạn chưa check-in hôm nay. Vui lòng bấm nút bên dưới để bắt đầu ca làm việc.',
      checkInTimeText: '--:--',
      checkOutTimeText: '--:--',
      isCheckInEmpty: true,
      isCheckOutEmpty: true,
      button: {
        action: 'checkin',
        text: 'Check-in vào ca',
        disabled: false,
        className: 'btn-checkin',
        iconSvg: `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
      },
    };
  }

  const checkInText = formatTimeDisplay(record.checkInTime);
  const isLate = record.status === 'LATE' || record.attendance_status === 'Late';

  // 2. Đã check-in nhưng chưa check-out
  if (!record.checkOutTime) {
    const badgeHtml = isLate
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

    return {
      statusType: isLate ? 'CHECKED_IN_LATE' : 'CHECKED_IN_ONTIME',
      badgeHtml,
      guidanceText: 'Bạn đã check-in. Hãy check-out khi kết thúc ngày làm việc.',
      checkInTimeText: checkInText,
      checkOutTimeText: '--:--',
      isCheckInEmpty: false,
      isCheckOutEmpty: true,
      button: {
        action: 'checkout',
        text: 'Check-out kết thúc ca',
        disabled: false,
        className: 'btn-checkout',
        iconSvg: `<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
      },
    };
  }

  // 3. Đã check-out hoàn tất ca làm việc
  const checkOutText = formatTimeDisplay(record.checkOutTime);

  // Quan trọng: Bảo toàn nhãn Đi muộn nếu lúc vào ca đã đi muộn
  const lateSubBadge = isLate
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

  const badgeHtml = `
    <span class="att-badge att-badge-info">
      <svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      Đã check-out
    </span>
    ${lateSubBadge}
  `;

  return {
    statusType: 'CHECKED_OUT',
    badgeHtml,
    guidanceText: 'Bạn đã hoàn thành chấm công hôm nay.',
    checkInTimeText: checkInText,
    checkOutTimeText: checkOutText,
    isCheckInEmpty: false,
    isCheckOutEmpty: false,
    button: {
      action: 'completed',
      text: 'Đã hoàn thành chấm công',
      disabled: true,
      className: 'btn-completed',
      iconSvg: `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
    },
  };
}

/**
 * Sinh mã HTML khung ban đầu của Widget
 * @returns {string} Chuỗi HTML Widget
 */
export function renderAttendanceWidgetMarkup() {
  const { timeStr, dateStr } = getVietnamClockParts();

  return `
    <div id="attendance-widget" class="attendance-widget-card" aria-label="Widget Chấm công hàng ngày">
      <!-- Header Widget -->
      <div class="att-widget-header">
        <div class="att-widget-title-group">
          <div class="att-widget-icon">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div>
            <h3 class="att-widget-title">Chấm công hàng ngày</h3>
            <div class="att-widget-subtitle">Theo dõi thời gian vào ca, tan ca theo thời gian thực</div>
          </div>
        </div>

        <!-- Vùng Badge trạng thái -->
        <div id="att-badge-area" class="att-badge-wrapper">
          <span class="att-badge att-badge-loading">
            <span class="att-spinner" style="width: 12px; height: 12px; border-width: 2px;"></span>
            Đang tải dữ liệu...
          </span>
        </div>
      </div>

      <!-- Thân Widget: 2 cột (Đồng hồ số thời gian thực & Thông tin chấm công) -->
      <div class="att-widget-body">
        <!-- Cột 1: Đồng hồ số thời gian thực -->
        <div class="att-clock-container">
          <div class="att-clock-label">
            <span class="pulse-dot"></span>
            <span>Thời gian hiện tại</span>
            <span class="att-tz-tag">GMT+7</span>
          </div>
          <div class="att-digital-clock" id="att-digital-clock-time">${timeStr}</div>
          <div class="att-date-display" id="att-digital-clock-date">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            <span>${dateStr}</span>
          </div>
        </div>

        <!-- Cột 2: Thông tin chấm công hôm nay & Nút hành động -->
        <div class="att-info-container">
          <!-- Lưới 2 ô: Giờ vào ca và Giờ tan ca -->
          <div class="att-times-grid">
            <div class="att-time-box" id="att-checkin-box">
              <div class="att-time-box-header">
                <span>GIỜ VÀO CA</span>
                <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="att-time-value is-empty" id="att-checkin-val">--:--</div>
            </div>

            <div class="att-time-box" id="att-checkout-box">
              <div class="att-time-box-header">
                <span>GIỜ TAN CA</span>
                <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
              </div>
              <div class="att-time-value is-empty" id="att-checkout-val">--:--</div>
            </div>
          </div>

          <!-- Thanh hướng dẫn hành động -->
          <div class="att-guidance-bar" id="att-guidance-bar">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
            <span id="att-guidance-text">Đang kiểm tra lịch sử chấm công hôm nay...</span>
          </div>

          <!-- Nút hành động Check-in / Check-out -->
          <div class="att-action-wrapper">
            <button type="button" class="att-action-btn btn-checkin" id="btn-att-action" disabled>
              <span class="att-spinner"></span>
              <span>Đang kết nối...</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Khởi động đồng hồ thời gian thực (Cập nhật mỗi 1 giây)
 * Đảm bảo chỉ có DUY NHẤT 1 interval chạy, dọn dẹp interval cũ nếu có.
 */
export function startRealtimeClock() {
  stopRealtimeClock();

  function tick() {
    const timeEl = qs('#att-digital-clock-time');
    const dateEl = qs('#att-digital-clock-date span');
    if (!timeEl) {
      // Nếu component đã bị gỡ khỏi DOM, tự động dừng interval
      stopRealtimeClock();
      return;
    }

    const { timeStr, dateStr } = getVietnamClockParts();
    timeEl.textContent = timeStr;
    if (dateEl && dateEl.textContent !== dateStr) {
      dateEl.textContent = dateStr;
    }
  }

  // Chạy ngay lần đầu
  tick();

  // Thiết lập chu kỳ 1000ms
  clockIntervalId = setInterval(tick, 1000);
}

/**
 * Dọn dẹp Interval của đồng hồ thời gian thực khi trang bị unmount
 */
export function stopRealtimeClock() {
  if (clockIntervalId) {
    clearInterval(clockIntervalId);
    clockIntervalId = null;
  }
}

/**
 * Cập nhật giao diện Widget dựa trên dữ liệu hiện tại
 */
export function updateWidgetUI() {
  const badgeArea = qs('#att-badge-area');
  const checkInVal = qs('#att-checkin-val');
  const checkOutVal = qs('#att-checkout-val');
  const checkInBox = qs('#att-checkin-box');
  const checkOutBox = qs('#att-checkout-box');
  const guidanceText = qs('#att-guidance-text');
  const actionBtn = qs('#btn-att-action');

  if (!badgeArea || !actionBtn) return;

  // Trường hợp đang gặp lỗi kết nối
  if (loadError) {
    badgeArea.innerHTML = `
      <span class="att-badge att-badge-error">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
        Lỗi kết nối
      </span>
      <button type="button" class="btn-att-retry" id="btn-att-retry">Thử lại</button>
    `;
    const retryBtn = qs('#btn-att-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => loadTodayAttendance());
    }

    if (guidanceText) {
      guidanceText.textContent = loadError;
    }
    actionBtn.disabled = true;
    actionBtn.className = 'att-action-btn btn-completed';
    actionBtn.innerHTML = `<span>Không thể thao tác</span>`;
    return;
  }

  // Trường hợp đang tải ban đầu
  if (isLoadingData) {
    badgeArea.innerHTML = `
      <span class="att-badge att-badge-loading">
        <span class="att-spinner" style="width: 12px; height: 12px; border-width: 2px;"></span>
        Đang tải...
      </span>
    `;
    actionBtn.disabled = true;
    actionBtn.innerHTML = `<span class="att-spinner"></span><span>Đang tải...</span>`;
    return;
  }

  // Tính toán trạng thái bình thường
  const state = computeWidgetState(currentAttendanceData);

  // Cập nhật badge
  badgeArea.innerHTML = state.badgeHtml;

  // Cập nhật giá trị vào ca / tan ca
  if (checkInVal) {
    checkInVal.textContent = state.checkInTimeText;
    checkInVal.className = `att-time-value ${state.isCheckInEmpty ? 'is-empty' : ''}`;
  }
  if (checkInBox) {
    checkInBox.classList.toggle('is-active', !state.isCheckInEmpty);
  }

  if (checkOutVal) {
    checkOutVal.textContent = state.checkOutTimeText;
    checkOutVal.className = `att-time-value ${state.isCheckOutEmpty ? 'is-empty' : ''}`;
  }
  if (checkOutBox) {
    checkOutBox.classList.toggle('is-active', !state.isCheckOutEmpty);
  }

  // Cập nhật hướng dẫn
  if (guidanceText) {
    guidanceText.textContent = state.guidanceText;
  }

  // Cập nhật nút hành động
  actionBtn.className = `att-action-btn ${state.button.className}`;
  actionBtn.disabled = state.button.disabled || isSubmitting;

  if (isSubmitting) {
    actionBtn.innerHTML = `
      <span class="att-spinner"></span>
      <span>Đang gửi yêu cầu...</span>
    `;
  } else {
    actionBtn.innerHTML = `
      ${state.button.iconSvg}
      <span>${state.button.text}</span>
    `;
  }

  // Gắn thuộc tính data-action để phục vụ xử lý sự kiện
  actionBtn.setAttribute('data-action', state.button.action);
}

/**
 * Tải dữ liệu chấm công hôm nay từ Backend API
 */
export async function loadTodayAttendance() {
  isLoadingData = true;
  loadError = null;
  updateWidgetUI();

  try {
    const res = await attendanceService.getTodayAttendance();
    const currentUser = getCurrentUser();
    currentAttendanceData = attendanceService.extractPersonalRecord(res, currentUser);
  } catch (err) {
    console.error('[AttendanceWidget] Lỗi tải dữ liệu chấm công:', err);
    loadError = err.message || 'Không thể kết nối máy chủ chấm công.';
    currentAttendanceData = null;
  } finally {
    isLoadingData = false;
    updateWidgetUI();
  }
}

/**
 * Xử lý sự kiện nhấn nút Check-in hoặc Check-out
 */
async function handleActionClick() {
  if (isSubmitting) return;

  const actionBtn = qs('#btn-att-action');
  if (!actionBtn) return;

  const action = actionBtn.getAttribute('data-action');
  if (action !== 'checkin' && action !== 'checkout') return;

  isSubmitting = true;
  updateWidgetUI();

  try {
    if (action === 'checkin') {
      const res = await attendanceService.checkIn();
      showToast(res.message || 'Check-in thành công!', 'success');
    } else if (action === 'checkout') {
      const res = await attendanceService.checkOut();
      showToast(res.message || 'Check-out thành công!', 'success');
    }

    // Tải lại dữ liệu mới nhất từ server
    await loadTodayAttendance();
  } catch (err) {
    console.error(`[AttendanceWidget] Lỗi khi thực hiện ${action}:`, err);
    const errorMsg = (err.data && err.data.message) || err.message || 'Thao tác không thành công.';
    showToast(errorMsg, 'danger');
  } finally {
    isSubmitting = false;
    updateWidgetUI();
  }
}

/**
 * Khởi tạo toàn bộ sự kiện cho Widget Chấm công
 */
export function initAttendanceWidgetEvents() {
  // 1. Kích hoạt đồng hồ số thời gian thực
  startRealtimeClock();

  // 2. Lắng nghe nút hành động Check-in / Check-out
  const actionBtn = qs('#btn-att-action');
  if (actionBtn) {
    actionBtn.addEventListener('click', handleActionClick);
  }

  // 3. Tải dữ liệu ban đầu
  loadTodayAttendance();
}

/**
 * Hàm dọn dẹp tài nguyên Widget khi chuyển trang
 */
export function destroyAttendanceWidget() {
  stopRealtimeClock();
  currentAttendanceData = null;
  isSubmitting = false;
  isLoadingData = false;
  loadError = null;
}

export default {
  render: renderAttendanceWidgetMarkup,
  initEvents: initAttendanceWidgetEvents,
  destroy: destroyAttendanceWidget,
  getVietnamClockParts,
  formatTimeDisplay,
  computeWidgetState,
};
