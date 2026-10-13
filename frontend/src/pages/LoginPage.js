import { qs } from '../utils/dom.js';
import { showToast } from '../components/Toast.js';
import { navigateTo } from '../router/router.js';

export function renderLoginPage() {
  return `
    <div class="auth-card">
      <div class="auth-header">
        <div class="auth-logo">
          <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <span>HRM ICTU</span>
        </div>
        <h1 class="auth-title">Đăng nhập hệ thống</h1>
        <p class="auth-subtitle">Cổng quản trị nhân sự và chấm công tự phục vụ</p>
      </div>

      <form id="login-form">
        <div class="form-group">
          <label class="form-label" for="login-username">Tên đăng nhập hoặc Email</label>
          <input
            type="text"
            id="login-username"
            class="form-input"
            placeholder="vd: admin hoặc minh.dq@hrm.local"
            autocomplete="username"
            required
          />
          <span class="form-hint text-error" id="username-error" style="display: none;"></span>
        </div>

        <div class="form-group">
          <label class="form-label" for="login-password">Mật khẩu</label>
          <div class="input-password-wrapper">
            <input
              type="password"
              id="login-password"
              class="form-input"
              placeholder="Nhập mật khẩu..."
              autocomplete="current-password"
              required
            />
            <button type="button" class="password-toggle-btn" id="password-toggle-btn" title="Hiện/ẩn mật khẩu">
              <svg id="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          <span class="form-hint text-error" id="password-error" style="display: none;"></span>
        </div>

        <button type="submit" class="btn btn-primary btn-block" id="login-submit-btn">
          <span>Đăng nhập vào hệ thống</span>
          <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </form>

      <!-- Gợi ý tài khoản kiểm thử cho đồ án -->
      <div class="demo-credentials-box">
        <div class="demo-credentials-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>Tài khoản kiểm thử mẫu:</span>
        </div>
        <div class="demo-credentials-list">
          <div>• <strong>Admin:</strong> <code>admin</code> / <code>Admin@123</code></div>
          <div>• <strong>HR Manager:</strong> <code>hr</code> / <code>Hr@123</code></div>
          <div>• <strong>Nhân viên:</strong> <code>emp1</code> / <code>Emp@123</code></div>
        </div>
        <div style="margin-top: 8px; font-size: 10px; color: #94a3b8;">
          * Lưu ý: Đây là màn hình giao diện SPA. Tính năng xác thực JWT thực tế sẽ được tích hợp ở Sprint 1.
        </div>
      </div>
    </div>
  `;
}

export function initLoginPageEvents() {
  const form = qs('#login-form');
  const usernameInput = qs('#login-username');
  const passwordInput = qs('#login-password');
  const usernameError = qs('#username-error');
  const passwordError = qs('#password-error');
  const toggleBtn = qs('#password-toggle-btn');

  // 1. Chuyển đổi ẩn/hiện mật khẩu
  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      toggleBtn.innerHTML = isPassword
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
    });
  }

  // 2. Xử lý gửi Form đăng nhập
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();

      let hasError = false;

      // Validation
      if (!username) {
        usernameError.textContent = 'Vui lòng nhập tên đăng nhập hoặc email.';
        usernameError.style.display = 'block';
        hasError = true;
      } else {
        usernameError.style.display = 'none';
      }

      if (!password) {
        passwordError.textContent = 'Vui lòng nhập mật khẩu.';
        passwordError.style.display = 'block';
        hasError = true;
      } else if (password.length < 6) {
        passwordError.textContent = 'Mật khẩu phải có độ dài tối thiểu 6 ký tự.';
        passwordError.style.display = 'block';
        hasError = true;
      } else {
        passwordError.style.display = 'none';
      }

      if (hasError) return;

      // Thông báo và chuyển hướng
      showToast(`Đăng nhập thành công với tài khoản: ${username}`, 'success');
      setTimeout(() => {
        navigateTo('/dashboard');
      }, 500);
    });
  }
}

export default {
  render: renderLoginPage,
  initEvents: initLoginPageEvents,
};
