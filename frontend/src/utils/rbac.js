/**
 * QUY TRÌNH PHÂN QUYỀN RBAC TRÊN GIAO DIỆN FRONTEND (HRM ICTU)
 * Hỗ trợ 3 vai trò chính:
 * - ADMIN: Quản trị viên hệ thống (truy cập toàn bộ chức năng)
 * - HR_MANAGER: Quản lý Nhân sự & Phòng ban
 * - EMPLOYEE: Nhân viên xem thông tin chung & chấm công cá nhân
 */

export const ROLES = {
  ADMIN: 'ADMIN',
  HR_MANAGER: 'HR_MANAGER',
  EMPLOYEE: 'EMPLOYEE',
};

/**
 * Chuẩn hóa vai trò từ dữ liệu người dùng sang mã chuẩn RBAC
 * Nguyên tắc từ chối mặc định (Default Deny): Nếu role không hợp lệ -> Trả về null
 * 
 * @param {string} role - Vai trò bất kỳ (vd: 'Admin', 'HR', 'Employee', 'HR_MANAGER')
 * @returns {string|null} 'ADMIN' | 'HR_MANAGER' | 'EMPLOYEE' | null
 */
export function normalizeRole(role) {
  if (!role || typeof role !== 'string') {
    return null;
  }

  const clean = role.trim().toUpperCase().replace(/[\s-]/g, '_');
  if (clean === 'ADMIN') return ROLES.ADMIN;
  if (clean === 'HR' || clean === 'HR_MANAGER' || clean === 'HRMANAGER') return ROLES.HR_MANAGER;
  if (clean === 'EMPLOYEE' || clean === 'EMP') return ROLES.EMPLOYEE;

  // Từ chối mặc định nếu không khớp với bất kỳ vai trò hợp lệ nào
  return null;
}

/**
 * Lấy nhãn hiển thị thân thiện và màu sắc cho từng vai trò
 * @param {string|null} role
 * @returns {{ label: string, shortLabel: string, badgeClass: string }}
 */
export function getRoleBadgeInfo(role) {
  const norm = normalizeRole(role);
  switch (norm) {
    case ROLES.ADMIN:
      return { label: 'Quản trị viên (Admin)', shortLabel: 'Admin', badgeClass: 'badge-purple' };
    case ROLES.HR_MANAGER:
      return { label: 'Quản lý Nhân sự (HR)', shortLabel: 'HR', badgeClass: 'badge-blue' };
    case ROLES.EMPLOYEE:
      return { label: 'Nhân viên (Employee)', shortLabel: 'Nhân viên', badgeClass: 'badge-gray' };
    default:
      return { label: 'Khách / Chưa phân quyền', shortLabel: 'Khách', badgeClass: 'badge-gray' };
  }
}

/**
 * Cấu hình toàn bộ cấu trúc Menu điều hướng của Sidebar
 * Phân chia theo Section và quy định rõ vai trò được phép truy cập
 */
export const NAVIGATION_SECTIONS = [
  {
    sectionId: 'section-overview',
    sectionTitle: 'TỔNG QUAN',
    items: [
      {
        id: 'nav-dashboard',
        label: 'Tổng quan',
        title: 'Tổng quan',
        path: '/dashboard',
        icon: `<svg viewBox="0 0 24 24"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
        allowedRoles: [ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.EMPLOYEE],
      },
    ],
  },
  {
    sectionId: 'section-hrm',
    sectionTitle: 'QUẢN LÝ NHÂN SỰ',
    items: [
      {
        id: 'nav-departments',
        label: 'Phòng ban',
        title: 'Phòng ban',
        path: '/departments',
        icon: `<svg viewBox="0 0 24 24"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>`,
        // Chỉ Admin và Quản lý nhân sự có quyền quản lý phòng ban
        allowedRoles: [ROLES.ADMIN, ROLES.HR_MANAGER],
      },
      {
        id: 'nav-employees',
        label: 'Nhân viên',
        title: 'Nhân viên',
        path: '/employees',
        icon: `<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        // Chỉ ADMIN và HR_MANAGER mới được xem danh sách nhân sự toàn công ty
        allowedRoles: [ROLES.ADMIN, ROLES.HR_MANAGER],
        badge: 'HR',
      },
      {
        id: 'nav-attendances',
        label: 'Chấm công',
        title: 'Chấm công',
        path: '/attendances',
        icon: `<svg viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>`,
        // Chỉ ADMIN và HR_MANAGER quản trị bảng chấm công công ty. Nhân viên chấm công trọn gói tại Dashboard
        allowedRoles: [ROLES.ADMIN, ROLES.HR_MANAGER],
      },
    ],
  },
  {
    sectionId: 'section-system',
    sectionTitle: 'HỆ THỐNG',
    items: [
      {
        id: 'nav-users',
        label: 'Tài khoản',
        title: 'Tài khoản',
        path: '/users',
        icon: `<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
        // Chỉ duy nhất ADMIN mới có quyền truy cập module tài khoản
        allowedRoles: [ROLES.ADMIN],
        badge: 'Admin',
      },
    ],
  },
];

/**
 * Kiểm tra xem người dùng có vai trò nhất định có quyền truy cập vào đường dẫn hay không
 * @param {string} path - Đường dẫn route (vd: '/users')
 * @param {string|null} userRole - Vai trò của người dùng
 * @returns {boolean}
 */
export function hasAccessToRoute(path, userRole) {
  const normRole = normalizeRole(userRole);
  if (!normRole) return false;

  for (const section of NAVIGATION_SECTIONS) {
    for (const item of section.items) {
      if (item.path === path) {
        return item.allowedRoles.includes(normRole);
      }
    }
  }

  // Mặc định các route không quy định cụ thể thì cho phép
  return true;
}

/**
 * Lọc danh sách Section và Menu Item theo vai trò người dùng hiện tại
 * @param {string|null} userRole - Vai trò của người dùng ('ADMIN', 'HR_MANAGER', 'EMPLOYEE')
 * @returns {Array} Danh sách Section đã được lọc, loại bỏ section trống
 */
export function filterNavigationByRole(userRole) {
  const normRole = normalizeRole(userRole);
  if (!normRole) return [];

  return NAVIGATION_SECTIONS.map((section) => {
    const accessibleItems = section.items.filter((item) =>
      item.allowedRoles.includes(normRole)
    );
    return {
      ...section,
      items: accessibleItems,
    };
  }).filter((section) => section.items.length > 0);
}

/**
 * Bí danh getMenuByRole tuân thủ đặc tả giao diện
 */
export const getMenuByRole = filterNavigationByRole;

export default {
  ROLES,
  normalizeRole,
  getRoleBadgeInfo,
  NAVIGATION_SECTIONS,
  hasAccessToRoute,
  filterNavigationByRole,
  getMenuByRole,
};
