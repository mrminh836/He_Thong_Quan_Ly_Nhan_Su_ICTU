import { qs } from '../utils/dom.js';
import { showToast } from '../components/Toast.js';
import { navigateTo } from '../router/router.js';
import authService from '../services/authService.js';

/**
 * Render cấu trúc HTML của trang Đăng nhập
 * @returns {string} HTML string
 */
export function renderLoginPage() {
  const rememberedUsername = authService.getRememberedUsername();

  return `
    <div class="auth-card">
      <!-- Header thương hiệu -->
      <div class="auth-header">
        <div class="auth-logo">
          <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <span>HRM ICTU</span>
        </div>
        <h1 class="auth-title">Đăng nhập hệ thống</h1>
        <p class="auth-subtitle">Cổng quản trị nhân sự và chấm công tự phục vụ doanh nghiệp</p>
      </div>

      <!-- Khung cảnh báo lỗi chung (Alert Banner) -->
      <div id="login-alert" class="auth-alert" style="display: none;" role="alert">
        <svg class="auth-alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span id="login-alert-message" class="auth-alert-text"></span>
        <button type="button" id="login-alert-close" class="auth-alert-close" aria-label="Đóng">&times;</button>
      </div>

      <!-- Form Đăng nhập -->
      <form id="login-form" novalidate>
        <!-- Trường Tên đăng nhập hoặc Email -->
        <div class="form-group">
          <label class="form-label" for="login-username">Tên đăng nhập hoặc Email <span class="text-danger">*</span></label>
          <div class="input-icon-wrapper">
            <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <input
              type="text"
              id="login-username"
              class="form-input has-icon"
              placeholder="vd: admin hoặc minh.dq@hrm.local"
              autocomplete="username"
              value="${rememberedUsername}"
              required
            />
          </div>
          <span class="form-hint text-error" id="username-error" style="display: none;"></span>
        </div>

        <!-- Trường Mật khẩu -->
        <div class="form-group">
          <div class="label-row">
            <label class="form-label" for="login-password">Mật khẩu <span class="text-danger">*</span></label>
          </div>
          <div class="input-password-wrapper">
            <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <input
              type="password"
              id="login-password"
              class="form-input has-icon"
              placeholder="Nhập mật khẩu..."
              autocomplete="current-password"
              required
            />
            <button type="button" class="password-toggle-btn" id="password-toggle-btn" title="Hiện/ẩn mật khẩu" aria-label="Hiện hoặc ẩn mật khẩu">
              <svg id="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
          <span class="form-hint text-error" id="password-error" style="display: none;"></span>
        </div>

        <!-- Tùy chọn Ghi nhớ đăng nhập -->
        <div class="form-group-options">
          <label class="checkbox-label" for="login-remember">
            <input
              type="checkbox"
              id="login-remember"
              class="form-checkbox"
              ${rememberedUsername ? 'checked' : ''}
            />
            <span>Ghi nhớ tên đăng nhập</span>
          </label>
        </div>

        <!-- Nút gửi yêu cầu đăng nhập -->
        <button type="submit" class="btn btn-primary btn-block" id="login-submit-btn">
          <span id="btn-text">Đăng nhập vào hệ thống</span>
          <svg id="btn-icon" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          <div id="btn-spinner" class="spinner-sm" style="display: none;"></div>
        </button>
      </form>

      <!-- Khung gợi ý tài khoản kiểm thử cho đồ án -->
      <div class="demo-credentials-box">
        <div class="demo-credentials-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span>Tài khoản kiểm thử sẵn sàng trong CSDL (Click để điền nhanh):</span>
        </div>
        <div class="demo-credentials-list">
          <div class="demo-user-item" data-user="admin" data-pass="AdminPassword2026!">
            • <strong>Admin:</strong> <code>admin</code> (Mật khẩu: <code>AdminPassword2026!</code>)
          </div>
          <div class="demo-user-item" data-user="hr" data-pass="HrPassword2026!">
            • <strong>HR Manager:</strong> <code>hr</code> (Mật khẩu: <code>HrPassword2026!</code>)
          </div>
          <div class="demo-user-item" data-user="emp1" data-pass="EmpPassword2026!">
            • <strong>Nhân viên:</strong> <code>emp1</code> (Mật khẩu: <code>EmpPassword2026!</code>)
          </div>
        </div>
        <div style="margin-top: 8px; font-size: 11px; color: #64748b;">
          * Hệ thống tự động xác thực qua API <code>POST /api/auth/login</code> và lưu trữ JWT an toàn vào localStorage.
        </div>
      </div>
    </div>
  `;
}

/**
 * Gắn kết các sự kiện tương tác của Form đăng nhập
 */
export function initLoginPageEvents() {
  const form = qs('#login-form');
  const usernameInput = qs('#login-username');
  const passwordInput = qs('#login-password');
  const rememberCheckbox = qs('#login-remember');
  const usernameError = qs('#username-error');
  const passwordError = qs('#password-error');
  const toggleBtn = qs('#password-toggle-btn');
  const submitBtn = qs('#login-submit-btn');
  const btnText = qs('#btn-text');
  const btnIcon = qs('#btn-icon');
  const btnSpinner = qs('#btn-spinner');

  const alertBox = qs('#login-alert');
  const alertMessage = qs('#login-alert-message');
  const alertClose = qs('#login-alert-close');

  let isSubmitting = false;

  // 1. Hàm hiển thị Alert lỗi chung
  function showAlert(message) {
    if (alertBox && alertMessage) {
      alertMessage.textContent = message;
      alertBox.style.display = 'flex';
      // Cuộn nhẹ để người dùng thấy thông báo
      alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function hideAlert() {
    if (alertBox) {
      alertBox.style.display = 'none';
    }
  }

  if (alertClose) {
    alertClose.addEventListener('click', hideAlert);
  }

  // 2. Chuyển đổi ẩn / hiện mật khẩu
  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      toggleBtn.innerHTML = isPassword
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
    });
  }

  // 3. Xóa lỗi khi người dùng nhập liệu (Live Input Validation Clearing)
  if (usernameInput) {
    usernameInput.addEventListener('input', () => {
      usernameError.style.display = 'none';
      usernameInput.classList.remove('input-error');
      hideAlert();
    });
  }

  if (passwordInput) {
    passwordInput.addEventListener('input', () => {
      passwordError.style.display = 'none';
      passwordInput.classList.remove('input-error');
      hideAlert();
    });
  }

  // 4. Click nhanh tài khoản mẫu để test
  const demoItems = document.querySelectorAll('.demo-user-item');
  demoItems.forEach((item) => {
    item.addEventListener('click', () => {
      const user = item.getAttribute('data-user');
      const pass = item.getAttribute('data-pass');
      if (usernameInput && user) usernameInput.value = user;
      if (passwordInput && pass) passwordInput.value = pass;
      hideAlert();
      usernameError.style.display = 'none';
      passwordError.style.display = 'none';
    });
  });

  // 5. Trạng thái Loading trên nút bấm (Prevent Double Submit)
  function setLoadingState(loading) {
    isSubmitting = loading;
    if (submitBtn) {
      submitBtn.disabled = loading;
    }
    if (usernameInput) usernameInput.disabled = loading;
    if (passwordInput) passwordInput.disabled = loading;

    if (btnText && btnIcon && btnSpinner) {
      if (loading) {
        btnText.textContent = 'Đang xác thực tài khoản...';
        btnIcon.style.display = 'none';
        btnSpinner.style.display = 'inline-block';
      } else {
        btnText.textContent = 'Đăng nhập vào hệ thống';
        btnIcon.style.display = 'inline-block';
        btnSpinner.style.display = 'none';
      }
    }
  }

  // 6. Xử lý gửi Form Đăng nhập
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Ngăn chặn nhấn liên tục khi đang xử lý request
      if (isSubmitting) return;

      hideAlert();

      const username = usernameInput ? usernameInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';
      const rememberMe = rememberCheckbox ? rememberCheckbox.checked : false;

      let hasError = false;

      // Validate Username / Email
      if (!username) {
        usernameError.textContent = 'Vui lòng nhập tên đăng nhập hoặc email.';
        usernameError.style.display = 'block';
        usernameInput.classList.add('input-error');
        hasError = true;
      } else if (username.includes('@')) {
        // Kiểm tra định dạng email cơ bản nếu người dùng nhập email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(username)) {
          usernameError.textContent = 'Định dạng email không hợp lệ (ví dụ: user@hrm.local).';
          usernameError.style.display = 'block';
          usernameInput.classList.add('input-error');
          hasError = true;
        } else {
          usernameError.style.display = 'none';
          usernameInput.classList.remove('input-error');
        }
      } else {
        usernameError.style.display = 'none';
        usernameInput.classList.remove('input-error');
      }

      // Validate Password
      if (!password) {
        passwordError.textContent = 'Vui lòng nhập mật khẩu.';
        passwordError.style.display = 'block';
        passwordInput.classList.add('input-error');
        hasError = true;
      } else {
        passwordError.style.display = 'none';
        passwordInput.classList.remove('input-error');
      }

      // Nếu có lỗi validate phía client -> Dừng lại, không gửi request
      if (hasError) {
        return;
      }

      // Kích hoạt trạng thái loading
      setLoadingState(true);

      try {
        // Gọi API Backend qua AuthService
        const { user } = await authService.login({
          username,
          password,
          rememberMe,
        });

        // Thông báo thành công
        const displayName = user?.fullName || user?.username || username;
        showToast(`Đăng nhập thành công! Chào mừng ${displayName}`, 'success');

        // Chuyển hướng sang trang Dashboard
        setTimeout(() => {
          navigateTo('/dashboard');
        }, 350);
      } catch (error) {
        setLoadingState(false);

        // Phân loại và hiển thị thông điệp lỗi chính xác
        if (error.isNetworkError) {
          showAlert('Không thể kết nối tới máy chủ Backend (cổng 3005). Vui lòng kiểm tra Docker hoặc kết nối mạng.');
        } else if (error.status === 401) {
          showAlert(error.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.');
        } else if (error.status === 403) {
          showAlert(error.message || 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên để được hỗ trợ.');
        } else if (error.status === 429) {
          showAlert(error.message || 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.');
        } else {
          showAlert(error.message || 'Đăng nhập không thành công. Vui lòng thử lại sau.');
        }
      }
    });
  }
}

export default {
  render: renderLoginPage,
  initEvents: initLoginPageEvents,
};
