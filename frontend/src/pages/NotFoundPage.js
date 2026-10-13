export function renderNotFoundPage() {
  return `
    <div class="not-found-container">
      <div class="not-found-code">404</div>
      <h1 class="not-found-title">Trang không tồn tại</h1>
      <p class="not-found-desc">
        Đường dẫn bạn vừa truy cập không tồn tại hoặc đã được di chuyển sang vị trí khác trong hệ thống HRM.
      </p>
      <a href="/dashboard" class="btn btn-primary" data-link>
        <svg viewBox="0 0 24 24"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span>Quay về trang Tổng quan</span>
      </a>
    </div>
  `;
}

export function initNotFoundPageEvents() {
  // Không có sự kiện phức tạp
}

export default {
  render: renderNotFoundPage,
  initEvents: initNotFoundPageEvents,
};
