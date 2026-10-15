import { qs, sanitizeHTML } from '../utils/dom.js';
import { employeeService } from '../services/employeeService.js';
import { getCurrentUserRole } from '../services/authService.js';
import { ROLES } from '../utils/rbac.js';
import { showToast } from './Toast.js';

/**
 * ==============================================================================
 * COMPONENT: EmployeeDetailModal (Modal Xem Hồ Sơ Chi Tiết Nhân Viên & Quyền CCCD)
 * ==============================================================================
 * 1. Tiêu đề: "Hồ sơ nhân viên"
 * 2. Phân chia rõ ràng 3 nhóm: Thông tin cá nhân, Thông tin công việc, Thông tin CCCD.
 * 3. Bảo vệ dữ liệu nhạy cảm (CCCD / CMND):
 *    - Chỉ tài khoản ADMIN và HR_MANAGER mới được xem số CCCD đã giải mã từ Backend.
 *    - Vai trò EMPLOYEE hoặc tài khoản không có quyền: Không hiển thị CCCD, thông báo từ chối.
 *    - Mặc định khi mở modal: CCCD được hiển thị ở dạng che mờ (vd: ••••••••8901 / 0382******34).
 *    - Nút Toggle "Hiện CCCD" / "Ẩn CCCD" để chuyển đổi hiển thị linh hoạt cho người có quyền.
 *    - Khi đóng modal: Xóa hoàn toàn CCCD khỏi state và bộ nhớ (zeroing variable memory).
 * 4. Xử lý đầy đủ các trạng thái: Đang tải (Loading), Thành công, Lỗi (403, 404, 500 kèm nút thử lại).
 * 5. Accessibility: Quản lý focus, phím Escape, backdrop click, khóa cuộn trang nền.
 */

let activeModalOverlay = null;
let triggerElement = null;
let escKeyHandler = null;

// Biến lưu trữ tạm thời trong phiên mở modal (sẽ bị xóa sạch khi đóng)
let currentEmployee = null;
let isCccdVisible = false;
let currentEmployeeId = null;

/**
 * Sinh chuỗi che mờ mặc định cho CCCD (ví dụ: ••••••••8901)
 * @param {string} cccd
 * @param {string} [fallbackMasked]
 * @returns {string}
 */
function getMaskedDisplay(cccd, fallbackMasked) {
  if (fallbackMasked && fallbackMasked.includes('*')) {
    return fallbackMasked;
  }
  const clean = String(cccd || '').trim();
  if (clean.length >= 4) {
    const last4 = clean.slice(-4);
    return '••••••••' + last4;
  }
  return '••••••••••••';
}

/**
 * Định dạng ngày sang chuẩn Việt Nam dd/MM/yyyy
 * @param {string|Date} dateVal
 * @returns {string}
 */
function formatDateVN(dateVal) {
  if (!dateVal) return '--';
  const str = String(dateVal).slice(0, 10);
  const parts = str.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return str;
}

/**
 * Đóng modal chi tiết nhân viên và dọn dẹp sạch sẽ bộ nhớ nhạy cảm
 */
export function closeEmployeeDetailModal() {
  if (escKeyHandler) {
    document.removeEventListener('keydown', escKeyHandler);
    escKeyHandler = null;
  }

  // Khôi phục thanh cuộn nền trang
  document.body.style.overflow = '';

  // BẢO MẬT: Xóa sạch dữ liệu CCCD khỏi bộ nhớ RAM của client
  currentEmployee = null;
  isCccdVisible = false;
  currentEmployeeId = null;

  if (activeModalOverlay) {
    activeModalOverlay.classList.remove('active');
    setTimeout(() => {
      if (activeModalOverlay && activeModalOverlay.parentNode) {
        // Dọn dẹp DOM sạch sẽ
        activeModalOverlay.parentNode.removeChild(activeModalOverlay);
      }
      activeModalOverlay = null;

      // Trả focus về nút đã mở modal (Accessibility)
      if (triggerElement && typeof triggerElement.focus === 'function') {
        try {
          triggerElement.focus();
        } catch {
          // Bỏ qua nếu phần tử không còn trong DOM
        }
        triggerElement = null;
      }
    }, 200);
  }
}

/**
 * Mở modal xem hồ sơ chi tiết nhân viên
 * @param {number|string} employeeId - ID nhân viên
 * @param {HTMLElement} [triggerEl] - Nút đã kích hoạt mở modal
 */
export async function openEmployeeDetailModal(employeeId, triggerEl) {
  // Đóng modal cũ nếu còn tồn tại
  closeEmployeeDetailModal();

  triggerElement = triggerEl || document.activeElement;
  currentEmployeeId = employeeId;
  isCccdVisible = false;

  // Tạo khung overlay modal
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'employee-detail-modal-overlay';

  overlay.innerHTML = `
    <div class="modal-container emp-detail-modal-container" role="dialog" aria-modal="true" aria-labelledby="emp-detail-modal-title">
      <div class="modal-header">
        <div class="modal-title-group">
          <h2 class="modal-title" id="emp-detail-modal-title">Hồ sơ nhân viên</h2>
          <p class="modal-subtitle">Thông tin chi tiết hồ sơ nhân sự và dữ liệu định danh bảo mật.</p>
        </div>
        <button type="button" class="modal-close-btn" id="btn-close-emp-detail" aria-label="Đóng cửa sổ">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="modal-body emp-detail-modal-body" id="emp-detail-modal-body">
        <!-- Khung tải dữ liệu ban đầu -->
        <div class="loading-container" style="padding: 48px 16px;">
          <div class="spinner"></div>
          <span style="font-size: 13px; color: #64748b;">Đang tải hồ sơ nhân viên...</span>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="btn-footer-close-detail">Đóng</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  activeModalOverlay = overlay;

  // Khóa cuộn trang nền
  document.body.style.overflow = 'hidden';

  // Kích hoạt transition
  requestAnimationFrame(() => {
    overlay.classList.add('active');
  });

  // Gắn sự kiện đóng modal
  const handleClose = () => closeEmployeeDetailModal();
  overlay.querySelector('#btn-close-emp-detail')?.addEventListener('click', handleClose);
  overlay.querySelector('#btn-footer-close-detail')?.addEventListener('click', handleClose);

  // Đóng khi click ngoài backdrop
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) handleClose();
  });

  // Đóng khi ấn Escape
  escKeyHandler = (e) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };
  document.addEventListener('keydown', escKeyHandler);

  // Gọi API tải dữ liệu hồ sơ
  await loadEmployeeProfile(employeeId, overlay);
}

/**
 * Gọi API GET /api/employees/:id và render nội dung hồ sơ
 * @param {number|string} employeeId
 * @param {HTMLElement} overlay
 */
async function loadEmployeeProfile(employeeId, overlay) {
  const bodyEl = overlay.querySelector('#emp-detail-modal-body');
  if (!bodyEl) return;

  try {
    const employee = await employeeService.getEmployeeById(employeeId);
    currentEmployee = employee;

    renderEmployeeProfileContent(overlay, employee);
  } catch (error) {
    console.warn('[EmployeeDetailModal] Lỗi lấy hồ sơ nhân viên:', error?.message);

    const statusCode = error.status || error.statusCode;
    const errorMsg = error.message || 'Không thể tải thông tin nhân viên.';

    // Phân loại trạng thái lỗi
    if (statusCode === 404) {
      bodyEl.innerHTML = `
        <div class="empty-state empty-state-error" style="padding: 40px 16px;">
          <div class="empty-state-icon" style="background-color: #fef2f2; color: #ef4444;">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div class="empty-state-title">Không tìm thấy hồ sơ nhân viên</div>
          <div class="empty-state-desc">Nhân sự này không tồn tại trong hệ thống hoặc đã bị xóa.</div>
        </div>
      `;
      return;
    }

    if (statusCode === 403) {
      bodyEl.innerHTML = `
        <div class="empty-state" style="padding: 40px 16px;">
          <div class="empty-state-icon" style="background-color: #fffbeb; color: #d97706;">
            <svg viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div class="empty-state-title">Không đủ quyền truy cập</div>
          <div class="empty-state-desc">Bạn không có quyền xem thông tin chi tiết của nhân viên này.</div>
        </div>
      `;
      return;
    }

    // Lỗi kết nối / Server 500
    bodyEl.innerHTML = `
      <div class="empty-state empty-state-error" style="padding: 40px 16px;">
        <div class="empty-state-icon" style="background-color: #fef2f2; color: #ef4444;">
          <svg viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        </div>
        <div class="empty-state-title">Lỗi kết nối máy chủ</div>
        <div class="empty-state-desc">${sanitizeHTML(errorMsg)}</div>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-retry-profile" style="margin-top: 12px;">
          <svg viewBox="0 0 24 24" width="14" height="14"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          <span>Thử lại</span>
        </button>
      </div>
    `;

    overlay.querySelector('#btn-retry-profile')?.addEventListener('click', () => {
      bodyEl.innerHTML = `
        <div class="loading-container" style="padding: 48px 16px;">
          <div class="spinner"></div>
          <span style="font-size: 13px; color: #64748b;">Đang tải hồ sơ nhân viên...</span>
        </div>
      `;
      loadEmployeeProfile(employeeId, overlay);
    });
  }
}

/**
 * Render cấu trúc các nhóm thông tin của hồ sơ nhân viên
 * @param {HTMLElement} overlay
 * @param {object} employee
 */
function renderEmployeeProfileContent(overlay, employee) {
  const bodyEl = overlay.querySelector('#emp-detail-modal-body');
  if (!bodyEl) return;

  // Lấy vai trò người dùng hiện tại để áp dụng chính sách hiển thị CCCD
  const userRole = getCurrentUserRole();
  const canViewCccd = userRole === ROLES.ADMIN || userRole === ROLES.HR_MANAGER;

  // Chữ cái đại diện Avatar
  const initials = (employee.fullName || 'NV')
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  // Giới tính
  const rawGender = String(employee.gender || '').toLowerCase();
  const genderText =
    rawGender === 'male' || rawGender === 'nam'
      ? 'Nam'
      : rawGender === 'female' || rawGender === 'nữ' || rawGender === 'nu'
      ? 'Nữ'
      : rawGender === 'other' || rawGender === 'khác' || rawGender === 'khac'
      ? 'Khác'
      : '--';

  // Trạng thái nhân sự
  const rawStatus = String(employee.status || employee.employmentStatus || '').toUpperCase();
  let statusBadge = '';
  if (rawStatus === 'ACTIVE') {
    statusBadge = `<span class="badge-status-active"><span class="status-indicator-dot dot-active"></span> Đang làm việc</span>`;
  } else if (rawStatus === 'ONLEAVE') {
    statusBadge = `<span class="badge-status-onleave"><span class="status-indicator-dot dot-onleave"></span> Nghỉ phép</span>`;
  } else if (rawStatus === 'RESIGNED') {
    statusBadge = `<span class="badge-status-resigned"><span class="status-indicator-dot dot-resigned"></span> Đã thôi việc</span>`;
  } else {
    statusBadge = `<span class="badge-status-inactive"><span class="status-indicator-dot dot-inactive"></span> Tạm dừng</span>`;
  }

  // Định dạng mức lương
  const salaryFormatted = employee.baseSalary
    ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(employee.baseSalary)
    : '--';

  // Render HTML chi tiết
  bodyEl.innerHTML = `
    <!-- Thẻ tóm tắt đầu hồ sơ -->
    <div class="emp-detail-header-card">
      <div class="emp-detail-avatar">${sanitizeHTML(initials)}</div>
      <div class="emp-detail-primary-info">
        <div class="emp-detail-name">${sanitizeHTML(employee.fullName || '--')}</div>
        <div class="emp-detail-sub">
          <span class="emp-code-badge">${sanitizeHTML(employee.employeeCode || '--')}</span>
          <span>•</span>
          <span>${sanitizeHTML(employee.departmentName || 'Chưa phân bổ')}</span>
          ${employee.position ? `<span>•</span> <span>${sanitizeHTML(employee.position)}</span>` : ''}
        </div>
      </div>
    </div>

    <!-- KHỐI 1: THÔNG TIN CÁ NHÂN -->
    <div class="emp-profile-section">
      <div class="emp-profile-section-title">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>Thông tin cá nhân</span>
      </div>

      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">Mã nhân viên</span>
          <span class="detail-value"><strong>${sanitizeHTML(employee.employeeCode || '--')}</strong></span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Họ và tên</span>
          <span class="detail-value">${sanitizeHTML(employee.fullName || '--')}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Số điện thoại</span>
          <span class="detail-value">${sanitizeHTML(employee.phone || '--')}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Email công việc</span>
          <span class="detail-value">${sanitizeHTML(employee.email || '--')}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Ngày sinh</span>
          <span class="detail-value">${formatDateVN(employee.dateOfBirth)}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Giới tính</span>
          <span class="detail-value">${genderText}</span>
        </div>

        <div class="detail-item" style="grid-column: 1 / -1;">
          <span class="detail-label">Địa chỉ liên hệ</span>
          <span class="detail-value">${sanitizeHTML(employee.address || 'Chưa cập nhật')}</span>
        </div>
      </div>
    </div>

    <!-- KHỐI 2: THÔNG TIN CÔNG VIỆC -->
    <div class="emp-profile-section" style="margin-top: 16px;">
      <div class="emp-profile-section-title">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/></svg>
        <span>Thông tin công việc</span>
      </div>

      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">Phòng ban trực thuộc</span>
          <span class="detail-value">${sanitizeHTML(employee.departmentName || 'Chưa phân bổ')}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Chức danh / Vị trí</span>
          <span class="detail-value">${sanitizeHTML(employee.position || 'Nhân viên')}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Ngày vào làm</span>
          <span class="detail-value">${formatDateVN(employee.hireDate)}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Lương cơ bản</span>
          <span class="detail-value">${salaryFormatted}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Trạng thái nhân sự</span>
          <span class="detail-value">${statusBadge}</span>
        </div>
      </div>
    </div>

    <!-- KHỐI 3: THÔNG TIN CCCD (QUYỀN BẢO MẬT & NÚT ẨN/HIỆN) -->
    <div class="emp-profile-section emp-cccd-section" style="margin-top: 16px;">
      <div class="emp-profile-section-title" style="color: #0369a1;">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        <span>Thông tin định danh (CCCD / CMND)</span>
      </div>

      <div class="emp-cccd-card" id="emp-cccd-container">
        <!-- Render động nội dung CCCD theo quyền -->
      </div>
    </div>
  `;

  // Render khu vực CCCD theo quyền hạn và gán sự kiện nút Ẩn/Hiện
  updateCccdCardDisplay(overlay, employee, canViewCccd);
}

/**
 * Cập nhật hiển thị hộp CCCD và nút Toggle Ẩn/Hiện
 * @param {HTMLElement} overlay
 * @param {object} employee
 * @param {boolean} canViewCccd
 */
function updateCccdCardDisplay(overlay, employee, canViewCccd) {
  const container = overlay.querySelector('#emp-cccd-container');
  if (!container) return;

  // 1. Trường hợp người dùng KHÔNG CÓ QUYỀN (Role EMPLOYEE hoặc khác)
  if (!canViewCccd) {
    container.innerHTML = `
      <div class="emp-cccd-denied-box">
        <svg viewBox="0 0 24 24" width="18" height="18" stroke="#f59e0b" stroke-width="2" fill="none"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span class="emp-cccd-denied-text">
          Thông tin số CCCD/CMND được bảo vệ an toàn. Chỉ Quản trị viên (Admin) và Quản lý nhân sự (HR) có quyền xem.
        </span>
      </div>
    `;
    return;
  }

  // 2. Trường hợp Backend KHÔNG TRẢ trường cccd
  const decryptedCccd = employee.cccd;
  if (!decryptedCccd) {
    container.innerHTML = `
      <div class="emp-cccd-denied-box">
        <svg viewBox="0 0 24 24" width="18" height="18" stroke="#64748b" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span class="emp-cccd-denied-text" style="color: #64748b;">
          ${employee.ssnMasked ? `Số CCCD (đã che): <code>${sanitizeHTML(employee.ssnMasked)}</code>` : 'Hồ sơ chưa có thông tin CCCD.'}
        </span>
      </div>
    `;
    return;
  }

  // 3. Người dùng CÓ QUYỀN (Admin/HR) và API trả về CCCD hợp lệ
  const maskedVal = getMaskedDisplay(decryptedCccd, employee.ssnMasked);
  const displayVal = isCccdVisible ? decryptedCccd : maskedVal;

  const toggleBtnIcon = isCccdVisible
    ? `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`
    : `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;

  const toggleBtnText = isCccdVisible ? 'Ẩn CCCD' : 'Hiện CCCD';

  container.innerHTML = `
    <div class="emp-cccd-header-row">
      <span class="emp-cccd-label">Số Căn cước công dân:</span>
      <div class="emp-cccd-actions-group">
        <span class="emp-security-badge" title="Mã hóa AES-256 bảo mật trực tiếp trong MySQL">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Giải mã AES-256
        </span>
        <button type="button" class="btn btn-secondary btn-sm emp-btn-toggle-cccd" id="btn-toggle-cccd" title="${isCccdVisible ? 'Che mờ số CCCD' : 'Xem toàn bộ số CCCD rõ'}">
          ${toggleBtnIcon}
          <span>${toggleBtnText}</span>
        </button>
      </div>
    </div>

    <div class="emp-cccd-value-box ${isCccdVisible ? 'is-visible' : 'is-masked'}">
      <span class="emp-cccd-number-text" id="emp-cccd-number-text">${sanitizeHTML(displayVal)}</span>
      ${
        isCccdVisible
          ? `<span class="badge badge-blue" style="font-size: 10px; padding: 1px 6px;">Đang hiển thị</span>`
          : `<span class="badge badge-gray" style="font-size: 10px; padding: 1px 6px;">Đã che mờ</span>`
      }
    </div>
  `;

  // Gắn sự kiện nút Toggle Ẩn / Hiện CCCD
  const toggleBtn = container.querySelector('#btn-toggle-cccd');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      isCccdVisible = !isCccdVisible;
      updateCccdCardDisplay(overlay, employee, canViewCccd);
    });
  }
}

export default {
  openEmployeeDetailModal,
  closeEmployeeDetailModal,
};
