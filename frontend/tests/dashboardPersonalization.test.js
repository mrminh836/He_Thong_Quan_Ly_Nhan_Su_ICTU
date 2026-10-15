/**
 * BỘ KIỂM THỬ: TÙY BIẾN DASHBOARD CÁ NHÂN CHO VAI TRÒ NHÂN VIÊN (HRM-DASH-PERSONAL)
 * Yêu cầu:
 * Khi vai trò là EMPLOYEE:
 *   - Ẩn các chỉ số công ty (Tổng số nhân sự, Phòng ban hoạt động, Sức khỏe Hạ tầng Docker, Nhật ký chấm công công ty)
 *   - Chỉ hiển thị:
 *     1. Widget chấm công của tôi (thời gian thực, check-in / check-out)
 *     2. Thống kê cá nhân (Số ngày công tích lũy trong tháng, Tỷ lệ đúng giờ, Trạng thái công hôm nay)
 *     3. Thẻ Hồ sơ cá nhân (Mã NV, Họ tên, Chức vụ, Phòng ban, Email, Số điện thoại)
 * Khi vai trò là ADMIN / HR_MANAGER:
 *   - Giữ nguyên giao diện Tổng quan hệ thống quản trị toàn công ty.
 */

import assert from 'node:assert';

// 1. Mock LocalStorage & SessionStorage
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, val) => storage.set(key, String(val)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};
globalThis.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
};

// 2. Mock DOM environment
globalThis.document = {
  title: '',
  body: { style: {} },
  createElement: () => ({
    classList: { add: () => {}, remove: () => {} },
    appendChild: () => {},
    querySelector: () => null,
    addEventListener: () => {},
  }),
};
globalThis.window = {
  location: { pathname: '/dashboard' },
  addEventListener: () => {},
};

const { setCurrentUser } = await import('../src/services/authService.js');
const { renderDashboardPage } = await import('../src/pages/DashboardPage.js');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
  }
}

console.log('\n===========================================================================');
console.log('📊 BẮT ĐẦU CHẠY TEST SUITE: TÙY BIẾN DASHBOARD CÁ NHÂN (EMPLOYEE VIEW)');
console.log('===========================================================================\n');

// -----------------------------------------------------------------------------
// NHÓM 1: GIAO DIỆN DÀNH CHO NHÂN VIÊN (EMPLOYEE)
// -----------------------------------------------------------------------------
console.log('--- NHÓM 1: GIAO DIỆN DÀNH CHO NHÂN VIÊN (EMPLOYEE) ---');

runTest('1. Nhân viên xem Dashboard: Có Widget chấm công của tôi', () => {
  setCurrentUser({
    id: 3,
    employeeId: 3,
    role: 'EMPLOYEE',
    fullName: 'Trần Văn Nam',
    employeeCode: 'NV003',
    departmentName: 'Phòng Kỹ thuật & CNTT',
    position: 'Kỹ sư Phần mềm',
    email: 'namtv@example.com',
    phone: '0912345678',
  });

  const html = renderDashboardPage();

  assert.ok(html.includes('attendance-widget-card'), 'Phải chứa thẻ Widget chấm công');
  assert.ok(html.includes('att-digital-clock'), 'Phải chứa đồng hồ kỹ thuật số');
  assert.ok(html.includes('att-checkin-box'), 'Phải có ô Giờ vào ca');
  assert.ok(html.includes('att-checkout-box'), 'Phải có ô Giờ tan ca');
});

runTest('2. Nhân viên xem Dashboard: Hiển thị Thẻ Số ngày công tích lũy trong tháng', () => {
  setCurrentUser({
    id: 3,
    employeeId: 3,
    role: 'EMPLOYEE',
    fullName: 'Trần Văn Nam',
    employeeCode: 'NV003',
  });

  const html = renderDashboardPage();

  assert.ok(html.includes('Số ngày công tích lũy trong tháng'), 'Phải hiển thị nhãn Số ngày công tích lũy trong tháng');
  assert.ok(html.includes('emp-monthly-days'), 'Phải có phần tử hiển thị ngày công emp-monthly-days');
  assert.ok(html.includes('Tỷ lệ đúng giờ tháng này'), 'Phải có tỷ lệ đúng giờ cá nhân');
  assert.ok(html.includes('Trạng thái công hôm nay'), 'Phải có trạng thái công hôm nay');
  assert.ok(html.includes('Ca làm việc tiêu chuẩn'), 'Phải có thông tin ca làm việc quy định');
});

runTest('3. Nhân viên xem Dashboard: Hiển thị Thẻ Hồ sơ cá nhân với đầy đủ thông tin', () => {
  setCurrentUser({
    id: 3,
    employeeId: 3,
    role: 'EMPLOYEE',
    fullName: 'Trần Văn Nam',
    employeeCode: 'NV003',
    departmentName: 'Phòng Kỹ thuật & CNTT',
    position: 'Kỹ sư Phần mềm',
    email: 'namtv@example.com',
    phone: '0912345678',
  });

  const html = renderDashboardPage();

  assert.ok(html.includes('personal-profile-card'), 'Phải có container personal-profile-card');
  assert.ok(html.includes('Hồ sơ nhân viên của tôi'), 'Phải có tiêu đề Hồ sơ nhân viên của tôi');
  assert.ok(html.includes('Trần Văn Nam'), 'Phải hiển thị Họ và tên nhân viên');
  assert.ok(html.includes('NV003'), 'Phải hiển thị Mã nhân viên NV003');
  assert.ok(html.includes('Phòng Kỹ thuật &amp; CNTT') || html.includes('Phòng Kỹ thuật & CNTT'), 'Phải hiển thị Tên phòng ban');
  assert.ok(html.includes('Kỹ sư Phần mềm'), 'Phải hiển thị Vị trí chức vụ');
  assert.ok(html.includes('namtv@example.com'), 'Phải hiển thị Email công việc');
  assert.ok(html.includes('0912345678'), 'Phải hiển thị Số điện thoại');
  assert.ok(html.includes('btn-view-my-profile'), 'Phải có nút Xem hồ sơ chi tiết');
});

runTest('4. Nhân viên xem Dashboard: ẨN TOÀN BỘ các chỉ số và hạ tầng của công ty', () => {
  setCurrentUser({
    id: 3,
    employeeId: 3,
    role: 'EMPLOYEE',
    fullName: 'Trần Văn Nam',
    employeeCode: 'NV003',
  });

  const html = renderDashboardPage();

  assert.ok(!html.includes('Tổng số nhân sự'), 'KHÔNG ĐƯỢC hiển thị chỉ số Tổng số nhân sự');
  assert.ok(!html.includes('Phòng ban hoạt động'), 'KHÔNG ĐƯỢC hiển thị chỉ số Phòng ban hoạt động');
  assert.ok(!html.includes('Sức khỏe Hạ tầng Docker'), 'KHÔNG ĐƯỢC hiển thị Sức khỏe Hạ tầng Docker');
  assert.ok(!html.includes('Nhật ký chấm công hôm nay'), 'KHÔNG ĐƯỢC hiển thị Nhật ký chấm công toàn công ty');
  assert.ok(!html.includes('dash-activity-list'), 'KHÔNG ĐƯỢC có phần tử dash-activity-list toàn công ty');
  assert.ok(!html.includes('db-health-badge'), 'KHÔNG ĐƯỢC có phần tử kiểm tra db-health-badge');
});

// -----------------------------------------------------------------------------
// NHÓM 2: GIAO DIỆN DÀNH CHO QUẢN TRỊ VIÊN & QUẢN LÝ NHÂN SỰ (ADMIN / HR)
// -----------------------------------------------------------------------------
console.log('\n--- NHÓM 2: GIAO DIỆN DÀNH CHO QUẢN TRỊ VIÊN & QUẢN LÝ (ADMIN / HR) ---');

runTest('5. Quản trị viên (ADMIN) xem Dashboard: Hiển thị đầy đủ số liệu toàn công ty', () => {
  setCurrentUser({
    id: 1,
    employeeId: 1,
    role: 'ADMIN',
    fullName: 'Đỗ Quang Minh',
    username: 'admin',
  });

  const html = renderDashboardPage();

  assert.ok(html.includes('Tổng quan hệ thống'), 'Tiêu đề phải là Tổng quan hệ thống');
  assert.ok(html.includes('Tổng số nhân sự'), 'ADMIN phải thấy chỉ số Tổng số nhân sự');
  assert.ok(html.includes('Phòng ban hoạt động'), 'ADMIN phải thấy chỉ số Phòng ban hoạt động');
  assert.ok(html.includes('Nhật ký chấm công hôm nay'), 'ADMIN phải thấy Nhật ký chấm công toàn công ty');
  assert.ok(html.includes('Sức khỏe Hạ tầng Docker'), 'ADMIN phải thấy Sức khỏe Hạ tầng Docker');
  assert.ok(html.includes('attendance-widget-card'), 'ADMIN vẫn có Widget chấm công');
  assert.ok(!html.includes('personal-profile-card'), 'ADMIN KHÔNG hiển thị card hồ sơ cá nhân riêng biệt');
});

runTest('6. Quản lý Nhân sự (HR_MANAGER) xem Dashboard: Hiển thị đầy đủ số liệu toàn công ty', () => {
  setCurrentUser({
    id: 2,
    employeeId: 2,
    role: 'HR_MANAGER',
    fullName: 'Nguyễn Thị Hoa',
    username: 'hr',
  });

  const html = renderDashboardPage();

  assert.ok(html.includes('Tổng quan hệ thống'), 'Tiêu đề phải là Tổng quan hệ thống');
  assert.ok(html.includes('Tổng số nhân sự'), 'HR_MANAGER phải thấy chỉ số Tổng số nhân sự');
  assert.ok(html.includes('Phòng ban hoạt động'), 'HR_MANAGER phải thấy chỉ số Phòng ban hoạt động');
  assert.ok(html.includes('Nhật ký chấm công hôm nay'), 'HR_MANAGER phải thấy Nhật ký chấm công toàn công ty');
  assert.ok(html.includes('Sức khỏe Hạ tầng Docker'), 'HR_MANAGER phải thấy Sức khỏe Hạ tầng Docker');
  assert.ok(html.includes('attendance-widget-card'), 'HR_MANAGER vẫn có Widget chấm công');
  assert.ok(!html.includes('personal-profile-card'), 'HR_MANAGER KHÔNG hiển thị card hồ sơ cá nhân riêng biệt');
});

runTest('7. Sidebar & Header phân quyền gộp: Nhân viên chỉ thấy duy nhất menu Tổng quan, không thấy Chấm công', async () => {
  const { renderSidebarMenu } = await import('../src/components/Sidebar.js');
  const { renderHeader } = await import('../src/components/Header.js');

  setCurrentUser({
    id: 3,
    employeeId: 3,
    role: 'EMPLOYEE',
    fullName: 'Trần Văn Nam',
    username: 'emp1',
  });

  const sidebarHtml = renderSidebarMenu('EMPLOYEE');
  assert.ok(sidebarHtml.includes('data-nav-path="/dashboard"'), 'Sidebar phải có Tổng quan');
  assert.ok(!sidebarHtml.includes('data-nav-path="/attendances"'), 'Sidebar Nhân viên KHÔNG ĐƯỢC có Chấm công');
  assert.ok(!sidebarHtml.includes('QUẢN LÝ NHÂN SỰ'), 'Section Quản lý nhân sự phải bị ẩn hoàn toàn khi không có item nào');

  const headerHtml = renderHeader();
  assert.ok(!headerHtml.includes('href="/attendances"'), 'Dropdown Header của Nhân viên không trỏ vào /attendances');
  assert.ok(headerHtml.includes('href="/dashboard"'), 'Dropdown Header của Nhân viên trỏ về Dashboard');
});

console.log('\n===========================================================================');
console.log(`📊 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT 100%`);
console.log('===========================================================================\n');

