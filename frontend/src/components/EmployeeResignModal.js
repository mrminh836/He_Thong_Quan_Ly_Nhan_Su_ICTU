import { sanitizeHTML } from '../utils/dom.js';
import { employeeService } from '../services/employeeService.js';
import { showToast } from './Toast.js';

/**
 * ==============================================================================
 * COMPONENT: EmployeeResignModal (Modal Xác nhận Cho nhân viên Thôi việc)
 * ==============================================================================
 * 1. Tiêu đề: "Xác nhận cho nhân viên thôi việc"
 * 2. Cảnh báo rõ ràng: khóa tài khoản người dùng và thu hồi quyền truy cập hệ thống.
 * 3. Hiển thị thông tin nhận diện nhân viên (Họ tên, Mã NV, Phòng ban, Chức vụ).
 * 4. Hai nút: "Hủy" (đóng popup không gọi API) và "Xác nhận thôi việc" (gọi PATCH /api/employees/:id).
 * 5. Chống gửi trùng lặp (debounce/disable loading state, chặn click nhiều lần).
 * 6. Xử lý lỗi toàn diện (400, 401, 403, 404, 409, 500) và dọn dẹp bộ nhớ state an toàn.
 */

let activeModalOverlay = null;
let triggerElement = null;
let escKeyHandler = null;
let isSubmitting = false;
let currentEmployee = null;

/**
 * Lấy ký tự viết tắt đại diện làm Avatar
 * @param {string} fullName
 * @returns {string}
 */
function getInitials(fullName) {
  if (!fullName) return 'NV';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Đóng modal xác nhận thôi việc và dọn dẹp sạch sẽ tài nguyên DOM & State
 */
export function closeEmployeeResignModal({ force = false } = {}) {
  if (isSubmitting && !force) return; // Chặn người dùng đóng modal khi đang gửi request xử lý API

  if (escKeyHandler) {
    document.removeEventListener('keydown', escKeyHandler);
    escKeyHandler = null;
  }

  // Khôi phục thanh cuộn trang nền
  document.body.style.overflow = '';

  // Xóa sạch tham chiếu nhân viên khỏi bộ nhớ
  currentEmployee = null;
  isSubmitting = false;

  if (activeModalOverlay) {
    activeModalOverlay.classList.remove('active');
    setTimeout(() => {
      if (activeModalOverlay && activeModalOverlay.parentNode) {
        activeModalOverlay.parentNode.removeChild(activeModalOverlay);
      }
      activeModalOverlay = null;

      // Trả focus về nút bấm ban đầu (Accessibility)
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
 * Mở modal popup xác nhận cho nhân viên thôi việc
 * @param {object} options
 * @param {object} options.employee - Đối tượng nhân viên cần thôi việc
 * @param {HTMLElement} [options.triggerEl] - Nút kích hoạt mở modal
 * @param {Function} [options.onSuccess] - Callback thực thi khi thôi việc thành công
 */
export function openEmployeeResignModal({ employee, triggerEl, onSuccess } = {}) {
  if (!employee || !employee.employeeId) {
    console.error('[EmployeeResignModal] Thiếu thông tin nhân viên hợp lệ.');
    showToast('Không tìm thấy thông tin nhân viên hợp lệ.', 'error');
    return;
  }

  // Đóng modal cũ nếu còn tồn tại
  closeEmployeeResignModal();

  triggerElement = triggerEl || document.activeElement;
  currentEmployee = { ...employee };
  isSubmitting = false;

  const initials = getInitials(currentEmployee.fullName);
  const empCode = sanitizeHTML(currentEmployee.employeeCode || `#${currentEmployee.employeeId}`);
  const empName = sanitizeHTML(currentEmployee.fullName || '--');
  const deptName = sanitizeHTML(currentEmployee.departmentName || 'Chưa phân bổ');
  const position = currentEmployee.position ? sanitizeHTML(currentEmployee.position) : null;
  const email = currentEmployee.email ? sanitizeHTML(currentEmployee.email) : null;

  // Tạo khung overlay modal
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'employee-resign-modal-overlay';

  overlay.innerHTML = `
    <div class="modal-container" style="max-width: 500px;" role="dialog" aria-modal="true" aria-labelledby="modal-resign-title">
      <!-- 1. MODAL HEADER -->
      <div class="modal-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="resign-modal-header-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="#dc2626" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
          <h2 class="modal-title" id="modal-resign-title" style="color: #991b1b; font-size: 1.125rem;">
            Xác nhận cho nhân viên thôi việc
          </h2>
        </div>
        <button type="button" class="modal-close-btn" id="modal-resign-close-icon" aria-label="Đóng popup">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- 2. MODAL BODY -->
      <div class="modal-body" style="padding: 20px 24px;">
        <!-- Khối thông báo cảnh báo -->
        <div class="resign-warning-box">
          <p class="resign-warning-text">
            Bạn có chắc chắn muốn chuyển nhân viên này sang trạng thái nghỉ việc không? Tài khoản đăng nhập của nhân viên sẽ bị khóa và nhân viên có thể không còn truy cập được hệ thống.
          </p>
        </div>

        <!-- Khối nhận diện nhân viên -->
        <div class="resign-emp-card">
          <div class="resign-emp-avatar">${sanitizeHTML(initials)}</div>
          <div class="resign-emp-info">
            <div class="resign-emp-name">${empName}</div>
            <div class="resign-emp-meta-grid">
              <div><span class="resign-meta-label">Mã nhân viên:</span> <span class="resign-meta-value emp-code-badge">${empCode}</span></div>
              <div><span class="resign-meta-label">Phòng ban:</span> <span class="resign-meta-value">${deptName}</span></div>
              ${position ? `<div><span class="resign-meta-label">Chức vụ:</span> <span class="resign-meta-value">${position}</span></div>` : ''}
              ${email ? `<div><span class="resign-meta-label">Email:</span> <span class="resign-meta-value">${email}</span></div>` : ''}
            </div>
          </div>
        </div>

        <!-- Banner thông báo lỗi khi API thất bại -->
        <div class="form-banner-error" id="resign-modal-error-banner" style="display: none; margin-top: 14px;">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span id="resign-modal-error-text"></span>
        </div>

        <p class="resign-modal-notice" style="margin-top: 14px;">
          Lưu ý: Thao tác này sẽ cập nhật trạng thái nhân viên thành <strong>Resigned</strong> và khóa tài khoản đăng nhập tương ứng. Lịch sử chấm công và hồ sơ vẫn được lưu giữ an toàn.
        </p>
      </div>

      <!-- 3. MODAL FOOTER -->
      <div class="modal-footer" style="padding: 16px 24px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 12px;">
        <button type="button" class="btn btn-secondary" id="modal-resign-cancel-btn">
          Hủy
        </button>
        <button type="button" class="btn btn-danger" id="modal-resign-confirm-btn">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <line x1="17" y1="11" x2="23" y2="11"/>
          </svg>
          <span>Xác nhận thôi việc</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  activeModalOverlay = overlay;

  // Khóa cuộn trang nền
  document.body.style.overflow = 'hidden';

  // Lấy các element tương tác
  const cancelBtn = overlay.querySelector('#modal-resign-cancel-btn');
  const confirmBtn = overlay.querySelector('#modal-resign-confirm-btn');
  const closeIcon = overlay.querySelector('#modal-resign-close-icon');
  const errorBanner = overlay.querySelector('#resign-modal-error-banner');
  const errorText = overlay.querySelector('#resign-modal-error-text');

  // Nút Hủy: đóng popup, không gọi API, không thay đổi dữ liệu
  cancelBtn.addEventListener('click', () => {
    if (!isSubmitting) {
      closeEmployeeResignModal();
    }
  });

  // Nút đóng icon (X)
  closeIcon.addEventListener('click', () => {
    if (!isSubmitting) {
      closeEmployeeResignModal();
    }
  });

  // Đóng khi click ngoài backdrop
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && !isSubmitting) {
      closeEmployeeResignModal();
    }
  });

  // Đóng khi nhấn phím Escape
  escKeyHandler = (e) => {
    if (e.key === 'Escape' && !isSubmitting) {
      closeEmployeeResignModal();
    }
  };
  document.addEventListener('keydown', escKeyHandler);

  // Xử lý xác nhận thôi việc
  confirmBtn.addEventListener('click', async () => {
    // 1. Chống gửi request trùng lặp và chặn double click
    if (isSubmitting) return;

    isSubmitting = true;
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    closeIcon.disabled = true;

    confirmBtn.innerHTML = `
      <div class="spinner btn-spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
      <span>Đang xử lý...</span>
    `;

    // Ẩn thông báo lỗi cũ nếu có
    if (errorBanner) {
      errorBanner.style.display = 'none';
      errorText.textContent = '';
    }

    try {
      // 2. Gọi API PATCH /api/employees/:id với payload { action: 'RESIGN' }
      const targetId = currentEmployee.employeeId;
      const res = await employeeService.resignEmployee(targetId);

      // 3. Xử lý thành công
      const successMessage = res?.message || 'Đã cho nhân viên nghỉ việc thành công.';
      showToast(successMessage, 'success');

      // Đóng popup an toàn
      isSubmitting = false;
      closeEmployeeResignModal({ force: true });

      // Callback cập nhật lại danh sách dữ liệu và thống kê
      if (typeof onSuccess === 'function') {
        onSuccess(res);
      }
    } catch (err) {
      // 4. Xử lý lỗi từ Backend
      isSubmitting = false;
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
      closeIcon.disabled = false;

      confirmBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <line x1="17" y1="11" x2="23" y2="11"/>
        </svg>
        <span>Xác nhận thôi việc</span>
      `;

      let errorMsg = 'Không thể thực hiện cho thôi việc.';
      const status = err.status || (err.data && err.data.statusCode);

      if (status === 400) {
        errorMsg = err.data?.message || err.message || 'Yêu cầu không hợp lệ. Vui lòng kiểm tra lại.';
      } else if (status === 401) {
        errorMsg = 'Phiên làm việc đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.';
      } else if (status === 403) {
        errorMsg = 'Bạn không có quyền quản lý nhân sự để thực hiện thôi việc.';
      } else if (status === 404) {
        errorMsg = 'Không tìm thấy thông tin nhân viên trong hệ thống.';
      } else if (status === 409) {
        errorMsg = err.data?.message || 'Nhân viên đã ở trạng thái nghỉ việc hoặc dữ liệu bị xung đột.';
      } else if (status === 500) {
        errorMsg = 'Lỗi hệ thống máy chủ nội bộ. Vui lòng thử lại sau.';
      } else if (err.message) {
        errorMsg = err.message;
      }

      if (errorBanner && errorText) {
        errorText.textContent = errorMsg;
        errorBanner.style.display = 'flex';
      }

      showToast(errorMsg, 'error');
    }
  });

  // Hiệu ứng animation mở modal
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    // Tự động focus vào nút Hủy để tránh người dùng vô tình bấm Enter xác nhận
    cancelBtn?.focus();
  });

  return overlay;
}

export default {
  openEmployeeResignModal,
  closeEmployeeResignModal,
};
