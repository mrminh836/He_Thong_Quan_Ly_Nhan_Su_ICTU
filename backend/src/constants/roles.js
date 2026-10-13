/**
 * ĐỊNH NGHĨA VAI TRÒ VÀ BẢNG QUYỀN RBAC (HRM ICTU)
 * Hỗ trợ 3 vai trò chuẩn:
 * - ADMIN: Quản trị viên hệ thống toàn quyền.
 * - HR_MANAGER: Quản lý nhân sự, phòng ban, chấm công.
 * - EMPLOYEE: Nhân viên xem và thao tác dữ liệu cá nhân của chính mình.
 */

export const ROLES = {
  ADMIN: 'ADMIN',
  HR_MANAGER: 'HR_MANAGER',
  EMPLOYEE: 'EMPLOYEE',
};

/**
 * Bảng ánh xạ linh hoạt từ các giá trị lưu trữ trong MySQL sang chuẩn RBAC
 * Database ENUM hiện tại: 'Admin', 'HR', 'Employee'
 */
export const DB_ROLE_MAP = {
  Admin: ROLES.ADMIN,
  HR: ROLES.HR_MANAGER,
  Employee: ROLES.EMPLOYEE,
  // Hỗ trợ cả trường hợp đồng bộ hoa/thường
  ADMIN: ROLES.ADMIN,
  HR_MANAGER: ROLES.HR_MANAGER,
  EMPLOYEE: ROLES.EMPLOYEE,
};

/**
 * Ánh xạ ngược từ mã RBAC về giá trị ENUM lưu trong Database
 */
export const RBAC_TO_DB_ROLE = {
  [ROLES.ADMIN]: 'Admin',
  [ROLES.HR_MANAGER]: 'HR',
  [ROLES.EMPLOYEE]: 'Employee',
};

/**
 * Hàm chuẩn hóa role đầu vào sang mã RBAC chuẩn
 * @param {string} role - Tên role bất kỳ (vd: 'Admin', 'admin', 'hr', 'HR_MANAGER')
 * @returns {string|null} Mã role chuẩn (ADMIN, HR_MANAGER, EMPLOYEE) hoặc null nếu không hợp lệ
 */
export function normalizeRole(role) {
  if (!role || typeof role !== 'string') {
    return null;
  }

  const clean = role.trim();

  // Kiểm tra bảng map trực tiếp
  if (DB_ROLE_MAP[clean]) {
    return DB_ROLE_MAP[clean];
  }

  // Thử nghiệm dạng in hoa loại bỏ dấu cách hoặc gạch nối
  const upper = clean.toUpperCase().replace(/[\s-]/g, '_');
  if (upper === 'ADMIN') return ROLES.ADMIN;
  if (upper === 'HR' || upper === 'HR_MANAGER' || upper === 'HRMANAGER') return ROLES.HR_MANAGER;
  if (upper === 'EMPLOYEE' || upper === 'EMP') return ROLES.EMPLOYEE;

  return null;
}

/**
 * Bảng ma trận phân quyền tĩnh (RBAC Permission Matrix)
 */
export const PERMISSIONS = {
  // Quản lý hệ thống & tài khoản
  MANAGE_USERS: [ROLES.ADMIN],
  VIEW_AUDIT_LOGS: [ROLES.ADMIN],

  // Quản lý phòng ban
  VIEW_DEPARTMENTS: [ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.EMPLOYEE],
  MANAGE_DEPARTMENTS: [ROLES.ADMIN, ROLES.HR_MANAGER],

  // Quản lý nhân viên
  VIEW_ALL_EMPLOYEES: [ROLES.ADMIN, ROLES.HR_MANAGER],
  MANAGE_EMPLOYEES: [ROLES.ADMIN, ROLES.HR_MANAGER],
  DECRYPT_SENSITIVE_SSN: [ROLES.ADMIN, ROLES.HR_MANAGER],

  // Quản lý chấm công
  VIEW_ALL_ATTENDANCE: [ROLES.ADMIN, ROLES.HR_MANAGER],
  MANAGE_ATTENDANCE: [ROLES.ADMIN, ROLES.HR_MANAGER],
  LOG_SELF_ATTENDANCE: [ROLES.EMPLOYEE, ROLES.HR_MANAGER, ROLES.ADMIN],
  VIEW_SELF_ATTENDANCE: [ROLES.EMPLOYEE, ROLES.HR_MANAGER, ROLES.ADMIN],

  // Báo cáo & Thống kê
  VIEW_DASHBOARD_STATS: [ROLES.ADMIN, ROLES.HR_MANAGER],
};

export default {
  ROLES,
  DB_ROLE_MAP,
  RBAC_TO_DB_ROLE,
  normalizeRole,
  PERMISSIONS,
};
