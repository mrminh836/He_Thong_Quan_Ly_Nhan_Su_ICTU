import { authService } from '../services/authService.js';
import { showToast } from './Toast.js';

/**
 * ==============================================================================
 * COMPONENT: ChangePasswordModal (Modal Đổi Mật Khẩu Cá Nhân - HRM-217)
 * ==============================================================================
 * Yêu cầu nghiệp vụ & bảo mật:
 * 1. Mật khẩu hiện tại, mật khẩu mới, xác nhận mật khẩu mới.
 * 2. Nút hiện/ẩn mật khẩu cho từng trường.
 * 3. Validate realtime & checklist độ mạnh mật khẩu (12 ký tự, hoa, thường, số, ký tự đặc biệt).
 * 4. Kiểm tra mật khẩu mới không trùng mật khẩu hiện tại.
 * 5. Xác nhận mật khẩu mới cập nhật realtime khi sửa mật khẩu mới.
 * 6. Tích hợp PUT /api/auth/change-password với JWT Bearer Token.
 * 7. Loading state chống double-click submission.
 * 8. Đóng bằng nút Hủy, icon X, phím Escape hoặc click ngoài overlay.
 * 9. Không lưu hay để lộ mật khẩu trong console/storage.
 */

let activeModalOverlay = null;
let isSubmitting = false;
let triggerElement = null;
let escKeyHandler = null;

// SVG Icons dùng chung
const ICONS = {
  eye: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  circle: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

/**
 * Tính toán độ mạnh mật khẩu và kiểm tra từng quy tắc độc lập
 * @param {string} password 
 * @param {string} [currentPassword]
 * @returns {object}
 */
export function calculatePasswordStrength(password, currentPassword = '') {
  const pwd = typeof password === 'string' ? password : '';

  const rules = {
    length: pwd.length >= 12,
    uppercase: /[A-Z]/.test(pwd),
    lowercase: /[a-z]/.test(pwd),
    number: /[0-9]/.test(pwd),
    special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(pwd),
    different: Boolean(currentPassword && pwd && pwd !== currentPassword),
  };

  if (!currentPassword) {
    rules.different = true;
  }

  // Đếm các điều kiện kỹ thuật đạt được (không tính different vào score)
  const technicalRules = [rules.length, rules.uppercase, rules.lowercase, rules.number, rules.special];
  const passedCount = technicalRules.filter(Boolean).length;

  let level = 'none';
  let label = 'Chưa nhập';
  let score = 0;

  if (pwd.length === 0) {
    level = 'none';
    label = 'Chưa nhập';
    score = 0;
  } else if (passedCount <= 2 || pwd.length < 8) {
    level = 'weak';
    label = 'Yếu';
    score = 1;
  } else if (passedCount === 3 || passedCount === 4) {
    level = 'medium';
    label = 'Trung bình';
    score = 2;
  } else if (passedCount === 5 && pwd.length >= 12) {
    level = 'strong';
    label = 'Rất mạnh';
    score = 4;
  } else {
    level = 'good';
    label = 'Khá';
    score = 3;
  }

  const isAllValid = rules.length && rules.uppercase && rules.lowercase && rules.number && rules.special;

  return {
    rules,
    passedCount,
    level,
    label,
    score,
    isAllValid,
  };
}

/**
 * Xác thực toàn bộ form đổi mật khẩu phía Frontend
 * @param {object} fields
 * @param {string} fields.currentPassword
 * @param {string} fields.newPassword
 * @param {string} fields.confirmPassword
 * @returns {{ isValid: boolean, errors: Record<string, string>, strength: object }}
 */
export function validateChangePasswordForm({ currentPassword, newPassword, confirmPassword }) {
  const errors = {};
  let isValid = true;

  // 1. Kiểm tra Mật khẩu hiện tại
  if (!currentPassword || typeof currentPassword !== 'string' || currentPassword.length === 0) {
    errors.currentPassword = 'Vui lòng nhập mật khẩu hiện tại.';
    isValid = false;
  }

  // 2. Kiểm tra Mật khẩu mới
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length === 0) {
    errors.newPassword = 'Vui lòng nhập mật khẩu mới.';
    isValid = false;
  } else {
    if (newPassword.trim().length === 0) {
      errors.newPassword = 'Mật khẩu mới không được chỉ chứa khoảng trắng.';
      isValid = false;
    } else if (newPassword.length < 12) {
      errors.newPassword = 'Mật khẩu mới phải có tối thiểu 12 ký tự.';
      isValid = false;
    } else if (!/[A-Z]/.test(newPassword)) {
      errors.newPassword = 'Mật khẩu mới phải có ít nhất một chữ cái viết hoa.';
      isValid = false;
    } else if (!/[a-z]/.test(newPassword)) {
      errors.newPassword = 'Mật khẩu mới phải có ít nhất một chữ cái viết thường.';
      isValid = false;
    } else if (!/[0-9]/.test(newPassword)) {
      errors.newPassword = 'Mật khẩu mới phải có ít nhất một chữ số.';
      isValid = false;
    } else if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(newPassword)) {
      errors.newPassword = 'Mật khẩu mới phải có ít nhất một ký tự đặc biệt.';
      isValid = false;
    } else if (currentPassword && newPassword === currentPassword) {
      errors.newPassword = 'Mật khẩu mới không được trùng với mật khẩu hiện tại.';
      isValid = false;
    }
  }

  // 3. Kiểm tra Xác nhận mật khẩu mới
  if (!confirmPassword || typeof confirmPassword !== 'string' || confirmPassword.length === 0) {
    errors.confirmPassword = 'Vui lòng nhập xác nhận mật khẩu mới.';
    isValid = false;
  } else if (confirmPassword !== newPassword) {
    errors.confirmPassword = 'Mật khẩu xác nhận không khớp.';
    isValid = false;
  }

  const strength = calculatePasswordStrength(newPassword, currentPassword);

  return {
    isValid,
    errors,
    strength,
  };
}

/**
 * Đóng Modal đổi mật khẩu an toàn và giải phóng tài nguyên
 */
export function closeChangePasswordModal() {
  if (isSubmitting) return; // Không đóng khi đang gửi API

  if (escKeyHandler) {
    document.removeEventListener('keydown', escKeyHandler);
    escKeyHandler = null;
  }

  if (activeModalOverlay) {
    activeModalOverlay.classList.remove('active');
    setTimeout(() => {
      if (activeModalOverlay && activeModalOverlay.parentNode) {
        activeModalOverlay.parentNode.removeChild(activeModalOverlay);
      }
      activeModalOverlay = null;

      // Trả lại tiêu điểm cho nút đã kích hoạt mở modal (Accessibility)
      if (triggerElement && typeof triggerElement.focus === 'function') {
        try {
          triggerElement.focus();
        } catch {
          // Bỏ qua nếu triggerElement không còn trong DOM
        }
        triggerElement = null;
      }
    }, 180);
  }
}

/**
 * Mở Modal Đổi Mật Khẩu Cá Nhân
 * @param {object} options
 * @param {Function} [options.onSuccess] - Callback sau khi đổi mật khẩu thành công
 * @param {Function} [options.onCancel] - Callback khi hủy bỏ
 */
export function openChangePasswordModal({ onSuccess = null, onCancel = null } = {}) {
  // Lưu nút kích hoạt để trả focus khi đóng modal
  triggerElement = document.activeElement;

  // Đóng modal cũ nếu đang tồn tại
  closeChangePasswordModal();

  // Khởi tạo phần tử Overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'change-password-modal-overlay';

  overlay.innerHTML = `
    <div class="modal-container" role="dialog" aria-modal="true" aria-labelledby="change-pwd-modal-title" style="max-width: 500px;">
      <!-- MODAL HEADER -->
      <div class="modal-header">
        <div class="modal-title-group">
          <h2 class="modal-title" id="change-pwd-modal-title" style="display: flex; align-items: center; gap: 8px;">
            ${ICONS.lock}
            <span>Đổi mật khẩu</span>
          </h2>
          <p class="modal-subtitle">Bảo vệ tài khoản bằng mật khẩu mạnh đạt chuẩn bảo mật HRM.</p>
        </div>
        <button type="button" class="modal-close-btn" id="change-pwd-close-btn" aria-label="Đóng modal">
          ${ICONS.close}
        </button>
      </div>

      <!-- MODAL BODY -->
      <div class="modal-body">
        <!-- Banner thông báo lỗi hệ thống/server -->
        <div class="form-banner-error" id="change-pwd-banner-error" role="alert">
          ${ICONS.alert}
          <span id="change-pwd-banner-error-text"></span>
        </div>

        <form id="change-password-form" autocomplete="off" novalidate>
          <!-- 1. Mật khẩu hiện tại -->
          <div class="form-group">
            <label class="form-label" for="current-password">
              Mật khẩu hiện tại <span class="required" style="color: var(--color-danger, #ef4444);">*</span>
            </label>
            <div class="pwd-input-group">
              <input 
                type="password" 
                id="current-password" 
                name="currentPassword" 
                class="form-input" 
                placeholder="Nhập mật khẩu bạn đang sử dụng" 
                autocomplete="current-password" 
                required 
              />
              <button 
                type="button" 
                class="pwd-toggle-btn" 
                id="toggle-current-password" 
                aria-label="Hiện mật khẩu hiện tại" 
                title="Hiện mật khẩu"
              >
                ${ICONS.eye}
              </button>
            </div>
            <div class="form-error-msg" id="current-password-error"></div>
          </div>

          <!-- 2. Mật khẩu mới -->
          <div class="form-group" style="margin-top: 12px;">
            <label class="form-label" for="new-password">
              Mật khẩu mới <span class="required" style="color: var(--color-danger, #ef4444);">*</span>
            </label>
            <div class="pwd-input-group">
              <input 
                type="password" 
                id="new-password" 
                name="newPassword" 
                class="form-input" 
                placeholder="Tối thiểu 12 ký tự an toàn" 
                autocomplete="new-password" 
                required 
              />
              <button 
                type="button" 
                class="pwd-toggle-btn" 
                id="toggle-new-password" 
                aria-label="Hiện mật khẩu mới" 
                title="Hiện mật khẩu"
              >
                ${ICONS.eye}
              </button>
            </div>
            <div class="form-error-msg" id="new-password-error"></div>

            <!-- Bảng đo độ mạnh mật khẩu và Checklist realtime -->
            <div class="pwd-strength-container" id="pwd-strength-container">
              <div class="pwd-strength-header">
                <span class="pwd-strength-title">Độ mạnh mật khẩu:</span>
                <span class="pwd-strength-label strength-none" id="pwd-strength-label">Chưa nhập</span>
              </div>
              <div class="pwd-strength-bar">
                <div class="pwd-strength-fill" id="pwd-strength-fill"></div>
              </div>
              <ul class="pwd-checklist" id="pwd-checklist">
                <li class="pwd-rule-item rule-unmet" id="rule-length">
                  <span class="pwd-rule-icon">${ICONS.circle}</span>
                  <span>Tối thiểu 12 ký tự</span>
                </li>
                <li class="pwd-rule-item rule-unmet" id="rule-upper">
                  <span class="pwd-rule-icon">${ICONS.circle}</span>
                  <span>Có ít nhất 1 chữ cái viết hoa (A-Z)</span>
                </li>
                <li class="pwd-rule-item rule-unmet" id="rule-lower">
                  <span class="pwd-rule-icon">${ICONS.circle}</span>
                  <span>Có ít nhất 1 chữ cái viết thường (a-z)</span>
                </li>
                <li class="pwd-rule-item rule-unmet" id="rule-number">
                  <span class="pwd-rule-icon">${ICONS.circle}</span>
                  <span>Có ít nhất 1 chữ số (0-9)</span>
                </li>
                <li class="pwd-rule-item rule-unmet" id="rule-special">
                  <span class="pwd-rule-icon">${ICONS.circle}</span>
                  <span>Có ít nhất 1 ký tự đặc biệt (!@#$%...)</span>
                </li>
                <li class="pwd-rule-item rule-unmet" id="rule-different">
                  <span class="pwd-rule-icon">${ICONS.circle}</span>
                  <span>Khác với mật khẩu hiện tại</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- 3. Xác nhận mật khẩu mới -->
          <div class="form-group" style="margin-top: 12px;">
            <label class="form-label" for="confirm-password">
              Xác nhận mật khẩu mới <span class="required" style="color: var(--color-danger, #ef4444);">*</span>
            </label>
            <div class="pwd-input-group">
              <input 
                type="password" 
                id="confirm-password" 
                name="confirmPassword" 
                class="form-input" 
                placeholder="Nhập lại mật khẩu mới vừa đặt" 
                autocomplete="new-password" 
                required 
              />
              <button 
                type="button" 
                class="pwd-toggle-btn" 
                id="toggle-confirm-password" 
                aria-label="Hiện mật khẩu xác nhận" 
                title="Hiện mật khẩu"
              >
                ${ICONS.eye}
              </button>
            </div>
            <div class="form-error-msg" id="confirm-password-error"></div>
          </div>
        </form>
      </div>

      <!-- MODAL FOOTER -->
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="btn-cancel-change-pwd">
          Hủy
        </button>
        <button type="submit" form="change-password-form" class="btn btn-primary" id="btn-submit-change-pwd">
          <span>Đổi mật khẩu</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  activeModalOverlay = overlay;

  // Hiển thị hiệu ứng mở modal
  requestAnimationFrame(() => {
    overlay.classList.add('active');
  });

  // Tham chiếu các phần tử DOM
  const form = overlay.querySelector('#change-password-form');
  const currentPwdInput = overlay.querySelector('#current-password');
  const newPwdInput = overlay.querySelector('#new-password');
  const confirmPwdInput = overlay.querySelector('#confirm-password');

  const currentPwdError = overlay.querySelector('#current-password-error');
  const newPwdError = overlay.querySelector('#new-password-error');
  const confirmPwdError = overlay.querySelector('#confirm-password-error');
  const bannerError = overlay.querySelector('#change-pwd-banner-error');
  const bannerErrorText = overlay.querySelector('#change-pwd-banner-error-text');

  const btnCancel = overlay.querySelector('#btn-cancel-change-pwd');
  const btnClose = overlay.querySelector('#change-pwd-close-btn');
  const btnSubmit = overlay.querySelector('#btn-submit-change-pwd');

  const toggleCurrentBtn = overlay.querySelector('#toggle-current-password');
  const toggleNewBtn = overlay.querySelector('#toggle-new-password');
  const toggleConfirmBtn = overlay.querySelector('#toggle-confirm-password');

  const strengthLabel = overlay.querySelector('#pwd-strength-label');
  const strengthFill = overlay.querySelector('#pwd-strength-fill');

  const ruleLength = overlay.querySelector('#rule-length');
  const ruleUpper = overlay.querySelector('#rule-upper');
  const ruleLower = overlay.querySelector('#rule-lower');
  const ruleNumber = overlay.querySelector('#rule-number');
  const ruleSpecial = overlay.querySelector('#rule-special');
  const ruleDifferent = overlay.querySelector('#rule-different');

  // Focus ngay vào ô nhập mật khẩu hiện tại
  if (currentPwdInput && typeof currentPwdInput.focus === 'function') {
    setTimeout(() => currentPwdInput.focus(), 50);
  }

  // Helper hiển thị / ẩn lỗi từng trường
  function setFieldError(inputEl, errorEl, message) {
    if (!errorEl || !inputEl) return;
    if (message) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
      inputEl.classList.add('is-invalid');
    } else {
      errorEl.textContent = '';
      errorEl.classList.remove('visible');
      inputEl.classList.remove('is-invalid');
    }
  }

  // Helper hiển thị banner lỗi chung
  function setBannerError(message) {
    if (!bannerError || !bannerErrorText) return;
    if (message) {
      bannerErrorText.textContent = message;
      bannerError.classList.add('visible');
    } else {
      bannerErrorText.textContent = '';
      bannerError.classList.remove('visible');
    }
  }

  // Helper chuyển đổi trạng thái rule checklist
  function updateRuleItem(itemEl, isMet) {
    if (!itemEl) return;
    if (isMet) {
      itemEl.classList.remove('rule-unmet');
      itemEl.classList.add('rule-met');
      const iconEl = itemEl.querySelector('.pwd-rule-icon');
      if (iconEl) iconEl.innerHTML = ICONS.check;
    } else {
      itemEl.classList.remove('rule-met');
      itemEl.classList.add('rule-unmet');
      const iconEl = itemEl.querySelector('.pwd-rule-icon');
      if (iconEl) iconEl.innerHTML = ICONS.circle;
    }
  }

  // Cập nhật realtime checklist và thanh đo độ mạnh mật khẩu
  function updateStrengthUI() {
    const newPwd = newPwdInput.value || '';
    const currentPwd = currentPwdInput.value || '';

    const strength = calculatePasswordStrength(newPwd, currentPwd);

    // Cập nhật nhãn và thanh đo
    if (strengthLabel) {
      strengthLabel.textContent = strength.label;
      strengthLabel.className = `pwd-strength-label strength-${strength.level}`;
    }

    if (strengthFill) {
      strengthFill.className = `pwd-strength-fill strength-${strength.level}`;
    }

    // Cập nhật từng dòng checklist
    updateRuleItem(ruleLength, strength.rules.length);
    updateRuleItem(ruleUpper, strength.rules.uppercase);
    updateRuleItem(ruleLower, strength.rules.lowercase);
    updateRuleItem(ruleNumber, strength.rules.number);
    updateRuleItem(ruleSpecial, strength.rules.special);
    updateRuleItem(ruleDifferent, strength.rules.different);
  }

  // Cài đặt nút bật/tắt hiển thị mật khẩu
  function setupPasswordToggle(button, input, labelPrefix) {
    if (!button || !input) return;

    button.addEventListener('click', () => {
      const isPassword = input.getAttribute('type') === 'password';
      const newType = isPassword ? 'text' : 'password';
      input.setAttribute('type', newType);

      button.innerHTML = isPassword ? ICONS.eyeOff : ICONS.eye;
      const actionText = isPassword ? 'Ẩn' : 'Hiện';
      button.setAttribute('aria-label', `${actionText} ${labelPrefix}`);
      button.setAttribute('title', `${actionText} ${labelPrefix}`);
    });
  }

  setupPasswordToggle(toggleCurrentBtn, currentPwdInput, 'mật khẩu hiện tại');
  setupPasswordToggle(toggleNewBtn, newPwdInput, 'mật khẩu mới');
  setupPasswordToggle(toggleConfirmBtn, confirmPwdInput, 'xác nhận mật khẩu');

  // Sự kiện nhập liệu realtime
  currentPwdInput.addEventListener('input', () => {
    setFieldError(currentPwdInput, currentPwdError, '');
    setBannerError('');
    updateStrengthUI();

    // Nếu mật khẩu mới đang bị báo trùng, re-validate
    if (newPwdInput.value && currentPwdInput.value === newPwdInput.value) {
      setFieldError(newPwdInput, newPwdError, 'Mật khẩu mới không được trùng với mật khẩu hiện tại.');
    } else if (newPwdError.textContent === 'Mật khẩu mới không được trùng với mật khẩu hiện tại.') {
      setFieldError(newPwdInput, newPwdError, '');
    }
  });

  newPwdInput.addEventListener('input', () => {
    setFieldError(newPwdInput, newPwdError, '');
    setBannerError('');
    updateStrengthUI();

    // Tự động kiểm tra lại xác nhận mật khẩu khi mật khẩu mới thay đổi
    if (confirmPwdInput.value.length > 0) {
      if (confirmPwdInput.value !== newPwdInput.value) {
        setFieldError(confirmPwdInput, confirmPwdError, 'Mật khẩu xác nhận không khớp.');
      } else {
        setFieldError(confirmPwdInput, confirmPwdError, '');
      }
    }
  });

  confirmPwdInput.addEventListener('input', () => {
    setBannerError('');
    if (confirmPwdInput.value.length > 0) {
      if (confirmPwdInput.value !== newPwdInput.value) {
        setFieldError(confirmPwdInput, confirmPwdError, 'Mật khẩu xác nhận không khớp.');
      } else {
        setFieldError(confirmPwdInput, confirmPwdError, '');
      }
    } else {
      setFieldError(confirmPwdInput, confirmPwdError, '');
    }
  });

  // Xử lý phím Escape
  escKeyHandler = (e) => {
    if (e.key === 'Escape' && !isSubmitting) {
      closeChangePasswordModal();
      onCancel?.();
    }
  };
  document.addEventListener('keydown', escKeyHandler);

  // Đóng khi click ngoài overlay container
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && !isSubmitting) {
      closeChangePasswordModal();
      onCancel?.();
    }
  });

  // Nút Hủy
  btnCancel.addEventListener('click', () => {
    if (!isSubmitting) {
      closeChangePasswordModal();
      onCancel?.();
    }
  });

  // Nút Đóng (X)
  btnClose.addEventListener('click', () => {
    if (!isSubmitting) {
      closeChangePasswordModal();
      onCancel?.();
    }
  });

  // Xử lý gửi Form Đổi Mật Khẩu
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setBannerError('');

    const currentPassword = currentPwdInput.value;
    const newPassword = newPwdInput.value;
    const confirmPassword = confirmPwdInput.value;

    // Validate toàn diện form
    const validation = validateChangePasswordForm({
      currentPassword,
      newPassword,
      confirmPassword,
    });

    if (!validation.isValid) {
      // Hiển thị lỗi tương ứng cho từng trường
      setFieldError(currentPwdInput, currentPwdError, validation.errors.currentPassword || '');
      setFieldError(newPwdInput, newPwdError, validation.errors.newPassword || '');
      setFieldError(confirmPwdInput, confirmPwdError, validation.errors.confirmPassword || '');

      // Focus vào trường lỗi đầu tiên
      if (validation.errors.currentPassword) {
        currentPwdInput.focus();
      } else if (validation.errors.newPassword) {
        newPwdInput.focus();
      } else if (validation.errors.confirmPassword) {
        confirmPwdInput.focus();
      }
      return;
    }

    // Bật trạng thái Loading & Chống click liên tiếp
    isSubmitting = true;
    btnSubmit.disabled = true;
    btnCancel.disabled = true;
    btnClose.disabled = true;
    currentPwdInput.disabled = true;
    newPwdInput.disabled = true;
    confirmPwdInput.disabled = true;

    btnSubmit.innerHTML = `<span class="spinner-sm"></span><span>Đang xử lý...</span>`;

    try {
      // Gửi yêu cầu lên API PUT /api/auth/change-password
      const res = await authService.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      // Thành công -> Thông báo toast và đóng modal
      showToast(res.message || 'Đổi mật khẩu thành công.', 'success');

      // Xóa giá trị input để bảo mật
      currentPwdInput.value = '';
      newPwdInput.value = '';
      confirmPwdInput.value = '';

      isSubmitting = false;
      closeChangePasswordModal();

      if (typeof onSuccess === 'function') {
        onSuccess(res);
      }
    } catch (error) {
      isSubmitting = false;

      // Phục hồi trạng thái các nút và trường nhập liệu
      btnSubmit.disabled = false;
      btnCancel.disabled = false;
      btnClose.disabled = false;
      currentPwdInput.disabled = false;
      newPwdInput.disabled = false;
      confirmPwdInput.disabled = false;
      btnSubmit.innerHTML = `<span>Đổi mật khẩu</span>`;

      const errorCode = error.data?.errorCode || error.data?.code || '';
      const errorMessage = error.data?.message || error.message || 'Đổi mật khẩu thất bại. Vui lòng thử lại sau.';

      // Bóc tách lỗi và hiển thị đúng vị trí
      if (errorCode === 'INVALID_CURRENT_PASSWORD' || errorMessage.includes('hiện tại không chính xác')) {
        setFieldError(currentPwdInput, currentPwdError, 'Mật khẩu hiện tại không chính xác.');
        currentPwdInput.focus();
        currentPwdInput.select?.();
      } else if (errorCode === 'PASSWORD_REUSED' || errorMessage.includes('không được trùng')) {
        setFieldError(newPwdInput, newPwdError, 'Mật khẩu mới không được trùng với mật khẩu hiện tại.');
        newPwdInput.focus();
      } else if (errorCode === 'CONFIRM_PASSWORD_MISMATCH' || errorMessage.includes('xác nhận không khớp')) {
        setFieldError(confirmPwdInput, confirmPwdError, 'Mật khẩu xác nhận không khớp.');
        confirmPwdInput.focus();
      } else if (errorCode === 'WEAK_PASSWORD' || errorCode === 'PASSWORD_TOO_LONG' || errorCode === 'INVALID_NEW_PASSWORD') {
        setFieldError(newPwdInput, newPwdError, errorMessage);
        newPwdInput.focus();
      } else if (error.status === 403 || errorCode === 'ACCOUNT_LOCKED') {
        setBannerError(errorMessage || 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên để được hỗ trợ.');
      } else if (error.status === 401) {
        setBannerError('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
      } else {
        // Lỗi 500, lỗi mạng hoặc lỗi không xác định
        setBannerError(errorMessage);
      }
    }
  });

  return {
    overlay,
    close: closeChangePasswordModal,
  };
}

export default {
  openChangePasswordModal,
  closeChangePasswordModal,
  validateChangePasswordForm,
  calculatePasswordStrength,
};
