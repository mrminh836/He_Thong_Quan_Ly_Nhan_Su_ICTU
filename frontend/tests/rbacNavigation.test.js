/**
 * BỘ KIỂM THỬ TỰ ĐỘNG FRONTEND: PHÂN QUYỀN RBAC MENU ĐIỀU HƯỚNG & ROUTE GUARD
 * Sử dụng Node.js built-in assert
 */

import assert from 'node:assert';

// Giả lập localStorage cho môi trường kiểm thử Node.js
const mockLocalStorageStore = new Map();
globalThis.localStorage = {
  getItem: (key) => mockLocalStorageStore.get(key) || null,
  setItem: (key, val) => mockLocalStorageStore.set(key, String(val)),
  removeItem: (key) => mockLocalStorageStore.delete(key),
  clear: () => mockLocalStorageStore.clear(),
};

// Import module RBAC và AuthService
const {
  ROLES,
  normalizeRole,
  getRoleBadgeInfo,
  NAVIGATION_SECTIONS,
  hasAccessToRoute,
  filterNavigationByRole,
  getMenuByRole,
} = await import('../src/utils/rbac.js');

const {
  setCurrentUser,
  getCurrentUser,
  getCurrentUserRole,
  getCurrentRole,
  logout,
} = await import('../src/services/authService.js');

const {
  renderSidebarMenu,
} = await import('../src/components/Sidebar.js');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Chi tiết: ${err.message}\n`);
    throw err;
  }
}

console.log('\n============================================================');
console.log('🧪 BẮT ĐẦU CHẠY BỘ KIỂM THỬ FRONTEND RBAC NAVIGATION MENU');
console.log('============================================================\n');

// -----------------------------------------------------------------------------
// NHÓM 1: CHUẨN HÓA VAI TRÒ (NORMALIZE ROLE & DEFAULT DENY)
// -----------------------------------------------------------------------------
test('Test 1.1: Chuẩn hóa vai trò Admin (hỗ trợ hoa, thường, khoảng trắng)', () => {
  assert.strictEqual(normalizeRole('ADMIN'), ROLES.ADMIN);
  assert.strictEqual(normalizeRole('Admin'), ROLES.ADMIN);
  assert.strictEqual(normalizeRole(' admin '), ROLES.ADMIN);
});

test('Test 1.2: Chuẩn hóa vai trò HR Manager (HR, HR_MANAGER, hrmanager)', () => {
  assert.strictEqual(normalizeRole('HR'), ROLES.HR_MANAGER);
  assert.strictEqual(normalizeRole('hr'), ROLES.HR_MANAGER);
  assert.strictEqual(normalizeRole('HR_MANAGER'), ROLES.HR_MANAGER);
  assert.strictEqual(normalizeRole('hr_manager'), ROLES.HR_MANAGER);
  assert.strictEqual(normalizeRole('HRMANAGER'), ROLES.HR_MANAGER);
});

test('Test 1.3: Chuẩn hóa vai trò Employee (Employee, EMP)', () => {
  assert.strictEqual(normalizeRole('EMPLOYEE'), ROLES.EMPLOYEE);
  assert.strictEqual(normalizeRole('Employee'), ROLES.EMPLOYEE);
  assert.strictEqual(normalizeRole('EMP'), ROLES.EMPLOYEE);
});

test('Test 1.4: Nguyên tắc từ chối mặc định (Default Deny) cho role không hợp lệ hoặc rỗng', () => {
  assert.strictEqual(normalizeRole(null), null);
  assert.strictEqual(normalizeRole(undefined), null);
  assert.strictEqual(normalizeRole(''), null);
  assert.strictEqual(normalizeRole('HACKER_ROLE'), null);
  assert.strictEqual(normalizeRole(12345), null);
});

// -----------------------------------------------------------------------------
// NHÓM 2: HUY HIỆU VAI TRÒ (ROLE BADGES)
// -----------------------------------------------------------------------------
test('Test 2.1: Nhãn và class CSS badge của từng vai trò', () => {
  const adminBadge = getRoleBadgeInfo(ROLES.ADMIN);
  assert.strictEqual(adminBadge.shortLabel, 'Admin');
  assert.strictEqual(adminBadge.badgeClass, 'badge-purple');

  const hrBadge = getRoleBadgeInfo(ROLES.HR_MANAGER);
  assert.strictEqual(hrBadge.shortLabel, 'HR');
  assert.strictEqual(hrBadge.badgeClass, 'badge-blue');

  const empBadge = getRoleBadgeInfo(ROLES.EMPLOYEE);
  assert.strictEqual(empBadge.shortLabel, 'Nhân viên');
  assert.strictEqual(empBadge.badgeClass, 'badge-gray');

  const invalidBadge = getRoleBadgeInfo('UNKNOWN');
  assert.strictEqual(invalidBadge.shortLabel, 'Khách');
  assert.strictEqual(invalidBadge.badgeClass, 'badge-gray');
});

// -----------------------------------------------------------------------------
// NHÓM 3: MA TRẬN PHÂN QUYỀN MENU ĐIỀU HƯỚNG (MENU MATRIX)
// -----------------------------------------------------------------------------
test('Test 3.1: ADMIN nhìn thấy toàn bộ 6 chức năng thuộc 3 Section', () => {
  const adminSections = filterNavigationByRole(ROLES.ADMIN);
  const allItems = adminSections.flatMap((s) => s.items);
  const paths = allItems.map((i) => i.path);

  assert.strictEqual(allItems.length, 6);
  assert.deepStrictEqual(paths, [
    '/dashboard',
    '/departments',
    '/employees',
    '/attendances',
    '/attendance-history',
    '/users',
  ]);
});

test('Test 3.2: HR_MANAGER nhìn thấy 5 chức năng, mục Tài khoản (/users) bị ẩn hoàn toàn', () => {
  const hrSections = filterNavigationByRole(ROLES.HR_MANAGER);
  const allItems = hrSections.flatMap((s) => s.items);
  const paths = allItems.map((i) => i.path);

  assert.strictEqual(allItems.length, 5);
  assert.strictEqual(paths.includes('/dashboard'), true);
  assert.strictEqual(paths.includes('/departments'), true);
  assert.strictEqual(paths.includes('/employees'), true);
  assert.strictEqual(paths.includes('/attendances'), true);
  assert.strictEqual(paths.includes('/attendance-history'), true);
  assert.strictEqual(paths.includes('/users'), false, 'HR Manager KHÔNG được nhìn thấy /users');

  // Mục HỆ THỐNG không còn item nào nên section cũng bị loại bỏ
  assert.strictEqual(hrSections.length, 2);
});

test('Test 3.3: EMPLOYEE nhìn thấy Tổng quan cá nhân và Lịch sử chấm công (ẩn các module quản lý)', () => {
  const empSections = filterNavigationByRole(ROLES.EMPLOYEE);
  const allItems = empSections.flatMap((s) => s.items);
  const paths = allItems.map((i) => i.path);

  assert.strictEqual(allItems.length, 2);
  assert.deepStrictEqual(paths, ['/dashboard', '/attendance-history']);
  assert.strictEqual(paths.includes('/departments'), false, 'Employee KHÔNG được thấy /departments');
  assert.strictEqual(paths.includes('/employees'), false, 'Employee KHÔNG được thấy /employees');
  assert.strictEqual(paths.includes('/attendances'), false, 'Employee gộp chấm công vào Dashboard, không thấy /attendances');
  assert.strictEqual(paths.includes('/users'), false, 'Employee KHÔNG được thấy /users');
});

test('Test 3.4: Vai trò không xác thực / rỗng -> Danh sách menu rỗng (Từ chối mặc định)', () => {
  assert.deepStrictEqual(filterNavigationByRole(null), []);
  assert.deepStrictEqual(filterNavigationByRole('FAKE_ROLE'), []);
  assert.deepStrictEqual(getMenuByRole(''), []);
});

// -----------------------------------------------------------------------------
// NHÓM 4: KIỂM SOÁT QUYỀN TRUY CẬP ROUTE (hasAccessToRoute)
// -----------------------------------------------------------------------------
test('Test 4.1: hasAccessToRoute - Quyền truy cập chi tiết từng đường dẫn', () => {
  // ADMIN
  assert.strictEqual(hasAccessToRoute('/dashboard', ROLES.ADMIN), true);
  assert.strictEqual(hasAccessToRoute('/departments', ROLES.ADMIN), true);
  assert.strictEqual(hasAccessToRoute('/employees', ROLES.ADMIN), true);
  assert.strictEqual(hasAccessToRoute('/attendances', ROLES.ADMIN), true);
  assert.strictEqual(hasAccessToRoute('/users', ROLES.ADMIN), true);

  // HR_MANAGER
  assert.strictEqual(hasAccessToRoute('/dashboard', ROLES.HR_MANAGER), true);
  assert.strictEqual(hasAccessToRoute('/departments', ROLES.HR_MANAGER), true);
  assert.strictEqual(hasAccessToRoute('/employees', ROLES.HR_MANAGER), true);
  assert.strictEqual(hasAccessToRoute('/attendances', ROLES.HR_MANAGER), true);
  assert.strictEqual(hasAccessToRoute('/users', ROLES.HR_MANAGER), false);

  // EMPLOYEE (Gộp Chấm công vào Dashboard, không truy cập /attendances quản lý toàn công ty)
  assert.strictEqual(hasAccessToRoute('/dashboard', ROLES.EMPLOYEE), true);
  assert.strictEqual(hasAccessToRoute('/attendances', ROLES.EMPLOYEE), false);
  assert.strictEqual(hasAccessToRoute('/departments', ROLES.EMPLOYEE), false);
  assert.strictEqual(hasAccessToRoute('/employees', ROLES.EMPLOYEE), false);
  assert.strictEqual(hasAccessToRoute('/users', ROLES.EMPLOYEE), false);

  // GUEST / INVALID ROLE
  assert.strictEqual(hasAccessToRoute('/dashboard', 'INVALID'), false);
  assert.strictEqual(hasAccessToRoute('/users', null), false);
});

// -----------------------------------------------------------------------------
// NHÓM 5: RENDER SIDEBAR MENU HTML THEO ROLE
// -----------------------------------------------------------------------------
test('Test 5.1: renderSidebarMenu sinh chuỗi HTML chính xác theo role', () => {
  const adminHtml = renderSidebarMenu(ROLES.ADMIN, '/dashboard');
  assert.strictEqual(adminHtml.includes('data-nav-path="/users"'), true);
  assert.strictEqual(adminHtml.includes('data-nav-path="/employees"'), true);

  const empHtml = renderSidebarMenu(ROLES.EMPLOYEE, '/dashboard');
  assert.strictEqual(empHtml.includes('data-nav-path="/dashboard"'), true);
  assert.strictEqual(empHtml.includes('data-nav-path="/attendances"'), false, 'Menu Chấm công bị ẩn khỏi Sidebar Nhân viên');
  assert.strictEqual(empHtml.includes('data-nav-path="/users"'), false);
  assert.strictEqual(empHtml.includes('data-nav-path="/employees"'), false);
  assert.strictEqual(empHtml.includes('data-nav-path="/departments"'), false);

  const invalidHtml = renderSidebarMenu(null);
  assert.strictEqual(invalidHtml.includes('Không có menu được phân quyền'), true);
});

// -----------------------------------------------------------------------------
// NHÓM 6: LIÊN KẾT VỚI AUTH SERVICE VÀ CHUYỂN ĐỔI TÀI KHOẢN (ACCOUNT SWITCHING)
// -----------------------------------------------------------------------------
test('Test 6.1: authService.getCurrentUserRole / getCurrentRole phản ánh phiên làm việc', () => {
  globalThis.localStorage.clear();

  // Chưa đăng nhập
  assert.strictEqual(getCurrentUserRole(), null);
  assert.strictEqual(getCurrentRole(), null);

  // Đăng nhập Admin
  setCurrentUser({ id: 1, username: 'admin', role: 'Admin' });
  assert.strictEqual(getCurrentUserRole(), ROLES.ADMIN);
  assert.strictEqual(getCurrentRole(), ROLES.ADMIN);

  // Đăng xuất
  logout();
  assert.strictEqual(getCurrentUserRole(), null);

  // Đăng nhập Employee
  setCurrentUser({ id: 2, username: 'emp1', role: 'Employee' });
  assert.strictEqual(getCurrentUserRole(), ROLES.EMPLOYEE);
  assert.strictEqual(getCurrentRole(), ROLES.EMPLOYEE);
});

test('Test 6.2: Chuyển đổi tài khoản từ Admin sang Employee không để lộ menu Admin', () => {
  // 1. Admin login
  setCurrentUser({ id: 1, username: 'admin', role: 'Admin' });
  let currentRole = getCurrentRole();
  let menuHtml = renderSidebarMenu(currentRole);
  assert.strictEqual(menuHtml.includes('data-nav-path="/users"'), true);

  // 2. Logout Admin
  logout();
  currentRole = getCurrentRole();
  assert.strictEqual(currentRole, null);

  // 3. Employee login
  setCurrentUser({ id: 3, username: 'emp1', role: 'Employee' });
  currentRole = getCurrentRole();
  menuHtml = renderSidebarMenu(currentRole);
  assert.strictEqual(menuHtml.includes('data-nav-path="/users"'), false);
  assert.strictEqual(menuHtml.includes('data-nav-path="/employees"'), false);
  assert.strictEqual(menuHtml.includes('data-nav-path="/dashboard"'), true);
  assert.strictEqual(menuHtml.includes('data-nav-path="/attendances"'), false);
});

console.log('\n============================================================');
console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ FRONTEND RBAC!`);
console.log('============================================================\n');
