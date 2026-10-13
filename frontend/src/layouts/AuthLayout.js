/**
 * Layout Xác thực (AuthLayout)
 * Khung toàn màn hình tối giản dành cho trang Đăng nhập
 * @param {string} contentHtml - Nội dung HTML của form đăng nhập
 * @returns {string} HTML string
 */
export function renderAuthLayout(contentHtml = '') {
  return `
    <div class="auth-shell">
      <div id="page-container">
        ${contentHtml}
      </div>
    </div>
  `;
}

export function initAuthLayoutEvents() {
  // Không có sidebar/header cần gắn sự kiện
}

export default {
  renderAuthLayout,
  initAuthLayoutEvents,
};
