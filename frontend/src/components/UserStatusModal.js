import { sanitizeHTML } from '../utils/dom.js';
import { getRoleBadgeInfo } from '../utils/rbac.js';

/**
 * ==============================================================================
 * COMPONENT: UserStatusModal
 * Modal xác nhận Khóa / Mở khóa tài khoản người dùng
 * Tuân thủ quy chuẩn WAI-ARIA, chống click đúp (anti-spam) và dọn dẹp DOM an toàn
 * ==============================================================================
 */

let activeModalOverlay = null;
let triggerElement = null;
let escKeyHandler = null;
let isSubmitting = false;

/**
 * Đóng modal và giải phóng tài nguyên sự kiện DOM
 * @param {object} [options]
 * @param {boolean} [options.force=false]
 */
export function closeUserStatusModal({ force = false } = {}) {
  if (isSubmitting && !force) return;

  if (escKeyHandler) {
    document.removeEventListener('keydown', escKeyHandler);
    escKeyHandler = null;
  }

  document.body.style.overflow = '';
  isSubmitting = false;

  if (activeModalOverlay) {
    activeModalOverlay.classList.remove('active');
    setTimeout(() => {
      if (activeModalOverlay && activeModalOverlay.parentNode) {
        activeModalOverlay.parentNode.removeChild(activeModalOverlay);
      }
      activeModalOverlay = null;

      if (triggerElement && typeof triggerElement.focus === 'function') {
        try {
          triggerElement.focus();
        } catch {
          // Bỏ qua nếu phần tử không còn trong DOM
        }
        triggerElement = null;
      }
    }, 150);
  }
}

/**
 * Mở modal xác nhận Khóa hoặc Mở khóa tài khoản
 * @param {object} options
 * @param {object} options.user - Thông tin người dùng { id, username, role, fullName, ... }
 * @param {string} options.targetStatus - 'Active' | 'Locked'
 * @param {HTMLElement} [options.triggerEl] - Phần tử kích hoạt để trả lại focus
 * @param {Function} options.onConfirm - Async callback khi người dùng bấm xác nhận
 * @param {Function} [options.onCancel] - Callback khi người dùng hủy bỏ
 */
export function openUserStatusModal({ user, targetStatus, triggerEl, onConfirm, onCancel } = {}) {
  if (!user || !user.id) {
    console.error('[UserStatusModal] Thiếu thông tin người dùng hợp lệ.');
    return;
  }

  // Đóng modal cũ nếu còn mở
  closeUserStatusModal({ force: true });

  triggerElement = triggerEl || document.activeElement;
  isSubmitting = false;

  const isLocking = targetStatus === 'Locked';
  const modalTitle = isLocking ? 'Khóa tài khoản?' : 'Mở khóa tài khoản?';
  const confirmBtnText = isLocking ? 'Xác nhận khóa' : 'Xác nhận mở khóa';
  const confirmBtnClass = isLocking ? 'btn-danger' : 'btn-primary';
  const roleInfo = getRoleBadgeInfo(user.role);

  const noticeMessage = isLocking
    ? 'Tài khoản sẽ không thể tiếp tục sử dụng hệ thống. Các request tiếp theo sử dụng phiên đăng nhập hiện tại sẽ bị từ chối theo cơ chế xác thực của hệ thống.'
    : 'Tài khoản sẽ được phép đăng nhập và sử dụng hệ thống trở lại nếu đáp ứng các điều kiện xác thực và phân quyền.';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay user-status-modal-overlay';
  overlay.id = 'user-status-modal-overlay';

  overlay.innerHTML = `
    <div class="modal-container user-status-modal-container" role="dialog" aria-modal="true" aria-labelledby="user-status-modal-title" aria-describedby="user-status-modal-desc">
      <!-- 1. MODAL HEADER -->
      <div class="modal-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="user-status-icon-box ${isLocking ? 'icon-danger' : 'icon-primary'}">
            ${isLocking ? `
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            ` : `
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
              </svg>
            `}
          </div>
          <h2 class="modal-title" id="user-status-modal-title" style="color: ${isLocking ? '#991b1b' : 'var(--color-text-main)'}; font-size: 1.125rem;">
            ${sanitizeHTML(modalTitle)}
          </h2>
        </div>
        <button type="button" class="modal-close-btn" id="user-status-modal-close" aria-label="Đóng popup">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- 2. MODAL BODY -->
      <div class="modal-body" style="padding: 20px 24px;">
        <!-- Khối thông báo cảnh báo -->
        <div class="user-status-warning-box ${isLocking ? 'box-danger' : 'box-primary'}" id="user-status-modal-desc">
          <p class="user-status-warning-text">
            ${sanitizeHTML(noticeMessage)}
          </p>
        </div>

        <!-- Khối thông tin chi tiết người dùng -->
        <div class="user-status-user-card">
          <div class="user-status-avatar-circle">
            ${sanitizeHTML(user.username ? user.username.slice(0, 2).toUpperCase() : 'US')}
          </div>
          <div class="user-status-user-info">
            <div class="user-status-username">
              <strong>${sanitizeHTML(user.username || '--')}</strong>
              <span class="badge ${sanitizeHTML(roleInfo.badgeClass)}">${sanitizeHTML(roleInfo.label)}</span>
            </div>
            <div class="user-status-meta-text">
              <span>Họ tên: <strong>${sanitizeHTML(user.fullName || 'Chưa liên kết hồ sơ')}</strong></span>
              ${user.employeeCode ? `<span>(Mã NV: <strong>${sanitizeHTML(user.employeeCode)}</strong>)</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Banner thông báo lỗi nếu API thất bại -->
        <div class="form-banner-error" id="user-status-modal-error" style="display: none; margin-top: 14px;">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span id="user-status-modal-error-msg"></span>
        </div>
      </div>

      <!-- 3. MODAL FOOTER -->
      <div class="modal-footer" style="padding: 16px 24px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 12px;">
        <button type="button" class="btn btn-secondary" id="user-status-modal-cancel">
          Hủy
        </button>
        <button type="button" class="btn ${confirmBtnClass}" id="user-status-modal-confirm">
          ${isLocking ? `
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          ` : `
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          `}
          <span id="user-status-confirm-text">${sanitizeHTML(confirmBtnText)}</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  activeModalOverlay = overlay;

  document.body.style.overflow = 'hidden';

  const cancelBtn = overlay.querySelector('#user-status-modal-cancel');
  const confirmBtn = overlay.querySelector('#user-status-modal-confirm');
  const closeBtn = overlay.querySelector('#user-status-modal-close');
  const errorBanner = overlay.querySelector('#user-status-modal-error');
  const errorMsg = overlay.querySelector('#user-status-modal-error-msg');
  const confirmTextSpan = overlay.querySelector('#user-status-confirm-text');

  // Kích hoạt transition xuất hiện
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    cancelBtn.focus();
  });

  const handleCancel = () => {
    if (isSubmitting) return;
    closeUserStatusModal();
    if (typeof onCancel === 'function') {
      onCancel();
    }
  };

  cancelBtn.addEventListener('click', handleCancel);
  closeBtn.addEventListener('click', handleCancel);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && !isSubmitting) {
      handleCancel();
    }
  });

  escKeyHandler = (e) => {
    if (e.key === 'Escape' && !isSubmitting) {
      handleCancel();
    }
  };
  document.addEventListener('keydown', escKeyHandler);

  confirmBtn.addEventListener('click', async () => {
    if (isSubmitting) return;

    isSubmitting = true;
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    closeBtn.disabled = true;
    errorBanner.style.display = 'none';

    if (confirmTextSpan) {
      confirmTextSpan.textContent = isLocking ? 'Đang khóa...' : 'Đang mở khóa...';
    }

    try {
      if (typeof onConfirm === 'function') {
        await onConfirm();
      }
      closeUserStatusModal({ force: true });
    } catch (err) {
      isSubmitting = false;
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
      closeBtn.disabled = false;
      if (confirmTextSpan) {
        confirmTextSpan.textContent = confirmBtnText;
      }

      // Hiển thị thông điệp lỗi chi tiết trên banner modal
      const message =
        err?.data?.message ||
        err?.message ||
        (isLocking ? 'Không thể khóa tài khoản.' : 'Không thể mở khóa tài khoản.');

      if (errorMsg && errorBanner) {
        errorMsg.textContent = message;
        errorBanner.style.display = 'flex';
      }
    }
  });
}

export default {
  openUserStatusModal,
  closeUserStatusModal,
};
