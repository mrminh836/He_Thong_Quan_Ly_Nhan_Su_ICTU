import { routes } from './routes.js';
import { qs, qsa } from '../utils/dom.js';
import { isAuthenticated, getCurrentUserRole } from '../services/authService.js';
import { showToast } from '../components/Toast.js';

let currentLayoutType = null;

/**
 * Tìm route tương ứng với URL hiện tại
 * @param {string} pathName
 * @returns {object} Route object
 */
export function matchRoute(pathName) {
  // Chuẩn hóa path (bỏ trailing slash nếu không phải root)
  const normalizedPath = pathName.length > 1 && pathName.endsWith('/') ? pathName.slice(0, -1) : pathName;

  // 1. Tìm route trùng khớp chính xác
  const matched = routes.find((r) => r.path === normalizedPath);
  if (matched) return matched;

  // 2. Fallback về route 404 (*)
  return routes.find((r) => r.path === '*') || routes[0];
}

/**
 * Điều hướng tới đường dẫn mới qua HTML5 History API
 * @param {string} path - Đường dẫn mới (vd: '/departments')
 */
export function navigateTo(path) {
  if (window.location.pathname === path) return;

  window.history.pushState(null, null, path);
  handleRouteChange();
}

/**
 * Xử lý cập nhật giao diện khi đường dẫn thay đổi
 */
export async function handleRouteChange() {
  const pathName = window.location.pathname;
  const route = matchRoute(pathName);

  // Xử lý chuyển hướng (Redirect)
  if (route.redirect) {
    navigateTo(route.redirect);
    return;
  }

  // ---------------------------------------------------------------------------
  // ROUTE GUARD: Kiểm tra quyền truy cập theo trạng thái đăng nhập & RBAC
  // ---------------------------------------------------------------------------
  const authenticated = isAuthenticated();

  // 1. Đã đăng nhập nhưng truy cập lại trang /login -> Chuyển về Dashboard
  if (authenticated && (route.path === '/login' || pathName === '/login')) {
    navigateTo('/dashboard');
    return;
  }

  // 2. Chưa đăng nhập mà truy cập các trang quản trị (layout 'app') -> Chuyển về /login
  if (!authenticated && route.layout === 'app' && route.path !== '/login') {
    navigateTo('/login');
    return;
  }

  // 3. Phân quyền RBAC: Đã đăng nhập nhưng vai trò không có quyền truy cập route này
  if (authenticated && Array.isArray(route.allowedRoles) && route.allowedRoles.length > 0) {
    const userRole = getCurrentUserRole();
    if (!route.allowedRoles.includes(userRole)) {
      showToast('Bạn không có quyền truy cập vào chức năng này.', 'warning');
      navigateTo('/dashboard');
      return;
    }
  }

  // Cập nhật tiêu đề trang
  document.title = route.title || 'HRM - Hệ Thống Quản Lý Nhân Sự ICTU';

  const appEl = qs('#app');
  if (!appEl) return;

  const pageContentHtml = route.component.render();

  // Kiểm tra nếu layout thay đổi (ví dụ: chuyển từ 'app' sang 'auth')
  if (currentLayoutType !== route.layout) {
    currentLayoutType = route.layout;
    appEl.innerHTML = route.renderLayout(pageContentHtml, pathName);

    // Kích hoạt sự kiện của Layout
    if (typeof route.initLayoutEvents === 'function') {
      route.initLayoutEvents();
    }
  } else {
    // Nếu cùng layout, chỉ cần cập nhật vùng #page-container và active sidebar
    const pageContainer = qs('#page-container');
    if (pageContainer) {
      pageContainer.innerHTML = pageContentHtml;
    }

    // Cập nhật trạng thái active trên Sidebar nếu đang ở AppLayout
    updateSidebarActiveState(pathName);
  }

  // Kích hoạt sự kiện tương tác riêng của trang
  if (typeof route.component.initEvents === 'function') {
    route.component.initEvents();
  }

  // Cuộn trang lên đầu
  window.scrollTo(0, 0);
}

/**
 * Cập nhật class active cho các mục trong Sidebar
 * @param {string} currentPath
 */
function updateSidebarActiveState(currentPath) {
  const navItems = qsa('.nav-item');
  navItems.forEach((item) => {
    const href = item.getAttribute('href');
    const isActive = currentPath === href || (href !== '/' && currentPath.startsWith(href));
    item.classList.toggle('active', isActive);
  });
}

/**
 * Khởi tạo Router và bộ lắng nghe sự kiện toàn cục
 */
export function initRouter() {
  // 1. Lắng nghe nút Back/Forward của trình duyệt
  window.addEventListener('popstate', () => {
    handleRouteChange();
  });

  // 2. Chặn sự kiện click trên các link có thuộc tính [data-link]
  document.body.addEventListener('click', (e) => {
    const linkEl = e.target.closest('[data-link]');
    if (!linkEl) return;

    // Bỏ qua nếu người dùng mở tab mới (Ctrl/Cmd + Click)
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;

    const href = linkEl.getAttribute('href');
    if (href && href.startsWith('/')) {
      e.preventDefault();
      navigateTo(href);
    }
  });

  // 3. Render trang đầu tiên dựa trên URL hiện hành
  handleRouteChange();
}

export default {
  initRouter,
  navigateTo,
  matchRoute,
};
