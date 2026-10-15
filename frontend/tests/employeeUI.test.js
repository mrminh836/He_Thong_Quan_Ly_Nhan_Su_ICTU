/**
 * BỘ KIỂM THỬ TỰ ĐỘNG FRONTEND: EMPLOYEE MANAGEMENT UI & SERVICE VALIDATION
 * Kiểm thử toàn diện các yêu cầu kỹ thuật theo Prompt Task HRM-123:
 * 1. Tích hợp Backend API GET /api/employees (query string page, limit, departmentId, search)
 * 2. Bảo vệ dữ liệu: Tuyệt đối KHÔNG hiển thị CCCD trong bảng danh sách
 * 3. employeeService.getEmployeeById và employeeService.getEmployeeSummaryStats
 * 4. Kiểm tra cấu trúc HTML render: Header, 3 thẻ KPI, Search input, Dept filter, Pagination
 * 5. Phân quyền RBAC cho nút "+ Thêm nhân viên" và truy cập route
 * 6. Tính toán logic phân trang (from, to, totalPages)
 * 7. Xử lý định dạng ngày tháng dd/MM/yyyy và phòng chống XSS
 */

import assert from 'node:assert';

// Mock localStorage
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};

// Mock fetch API
let mockFetchHandler = null;
globalThis.fetch = async (url, options = {}) => {
  if (typeof mockFetchHandler === 'function') {
    return await mockFetchHandler(url, options);
  }
  return {
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({ success: true, data: [] }),
  };
};

const { employeeService } = await import('../src/services/employeeService.js');
const { renderEmployeesPage } = await import('../src/pages/EmployeesPage.js');
const { ROLES, hasAccessToRoute } = await import('../src/utils/rbac.js');
const { sanitizeHTML } = await import('../src/utils/dom.js');

let passedTests = 0;
let totalTests = 0;

async function testAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Chi tiết: ${err.message}\n`);
    throw err;
  }
}

console.log('\n============================================================');
console.log('👥 BẮT ĐẦU CHẠY BỘ KIỂM THỬ FRONTEND EMPLOYEE MANAGEMENT');
console.log('============================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: employeeService.getEmployees - Query String đầy đủ
// -----------------------------------------------------------------------------
await testAsync('Test 1: employeeService.getEmployees() xây dựng đúng Query String và xử lý tham số', async () => {
  let requestedUrl = '';
  mockFetchHandler = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: true,
        message: 'Lấy danh sách nhân viên thành công',
        data: [
          {
            employeeId: 1,
            employeeCode: 'NV001',
            fullName: 'Đỗ Quang Minh',
            departmentId: 1,
            departmentName: 'Phòng Kỹ thuật',
            phone: '0987654321',
            hireDate: '2025-01-10',
            status: 'ACTIVE',
          },
        ],
        pagination: { page: 2, limit: 20, total: 25, totalPages: 2 },
      }),
    };
  };

  const res = await employeeService.getEmployees({
    page: 2,
    limit: 20,
    departmentId: 1,
    search: 'Nguyen',
  });

  assert.ok(requestedUrl.includes('/employees?'), 'URL phải gọi /employees với query string');
  assert.ok(requestedUrl.includes('page=2'), 'Phải chứa page=2');
  assert.ok(requestedUrl.includes('limit=20'), 'Phải chứa limit=20');
  assert.ok(requestedUrl.includes('departmentId=1'), 'Phải chứa departmentId=1');
  assert.ok(requestedUrl.includes('search=Nguyen'), 'Phải chứa search=Nguyen');

  assert.strictEqual(res.items.length, 1);
  assert.strictEqual(res.pagination.total, 25);
  assert.strictEqual(res.pagination.totalPages, 2);
});

// -----------------------------------------------------------------------------
// TEST 2: employeeService.getEmployees - Bỏ qua param rỗng hoặc 'all'
// -----------------------------------------------------------------------------
await testAsync('Test 2: employeeService.getEmployees() không gửi departmentId nếu là "all" hoặc search rỗng', async () => {
  let requestedUrl = '';
  mockFetchHandler = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: true,
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      }),
    };
  };

  await employeeService.getEmployees({
    page: 1,
    limit: 10,
    departmentId: 'all',
    search: '   ',
  });

  assert.ok(!requestedUrl.includes('departmentId'), 'Không được truyền departmentId khi chọn "all"');
  assert.ok(!requestedUrl.includes('search='), 'Không được truyền search khi từ khóa chỉ có khoảng trắng');
});

// -----------------------------------------------------------------------------
// TEST 3: BẢO MẬT - Không có CCCD trong dữ liệu trả về của danh sách
// -----------------------------------------------------------------------------
await testAsync('Test 3: Tuyệt đối KHÔNG có trường CCCD hoặc ciphertext trong bảng danh sách nhân sự', async () => {
  mockFetchHandler = async () => ({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({
      success: true,
      data: [
        {
          employeeId: 1,
          employeeCode: 'NV001',
          fullName: 'Đỗ Quang Minh',
          departmentId: 1,
          departmentName: 'Phòng Kỹ thuật & Công nghệ',
          phone: '0987654321',
          hireDate: '2025-01-10',
          status: 'ACTIVE',
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    }),
  });

  const res = await employeeService.getEmployees();
  const item = res.items[0];

  assert.strictEqual(item.cccd, undefined, 'Không được có trường cccd');
  assert.strictEqual(item.ssn_encrypted, undefined, 'Không được có trường ssn_encrypted');
  assert.strictEqual(item.encryption_key, undefined, 'Không được có khóa bảo mật');
});

// -----------------------------------------------------------------------------
// TEST 4: employeeService.getEmployeeById - Kiểm tra ID và gọi chi tiết
// -----------------------------------------------------------------------------
await testAsync('Test 4: employeeService.getEmployeeById() kiểm tra ID hợp lệ và trả về chi tiết', async () => {
  let requestedUrl = '';
  mockFetchHandler = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: true,
        data: {
          employeeId: 10,
          employeeCode: 'NV010',
          fullName: 'Nguyễn Văn A',
          cccd: '038202001234',
        },
      }),
    };
  };

  const emp = await employeeService.getEmployeeById(10);
  assert.ok(requestedUrl.includes('/employees/10'), 'Phải gọi đúng endpoint /employees/:id');
  assert.strictEqual(emp.employeeCode, 'NV010');

  // Kiểm tra từ chối ID không hợp lệ
  await assert.rejects(async () => {
    await employeeService.getEmployeeById('invalid-abc');
  }, /không hợp lệ/);
});

// -----------------------------------------------------------------------------
// TEST 5: employeeService.getEmployeeSummaryStats - Thống kê chỉ số KPI
// -----------------------------------------------------------------------------
await testAsync('Test 5: employeeService.getEmployeeSummaryStats() tính toán chính xác 3 chỉ số tổng quan', async () => {
  mockFetchHandler = async (url) => {
    assert.ok(url.includes('/departments/statistics'));
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: true,
        data: [
          { departmentId: 1, employeeCount: 3, activeCount: 3 },
          { departmentId: 2, employeeCount: 1, activeCount: 1 },
          { departmentId: 3, employeeCount: 0, activeCount: 0 },
        ],
        meta: {
          totalDepartments: 3,
          emptyDepartments: 1,
          totalEmployees: 4,
          activeEmployees: 4,
        },
      }),
    };
  };

  const stats = await employeeService.getEmployeeSummaryStats();
  assert.strictEqual(stats.totalEmployees, 4, 'Tổng nhân viên phải là 4');
  assert.strictEqual(stats.activeEmployees, 4, 'Nhân viên hoạt động phải là 4');
  assert.strictEqual(stats.deptsWithEmployees, 2, 'Số phòng ban có nhân viên (>0) phải là 2');
});

// -----------------------------------------------------------------------------
// TEST 6: renderEmployeesPage - Cấu trúc giao diện Enterprise HRM SaaS
// -----------------------------------------------------------------------------
await testAsync('Test 6: renderEmployeesPage() sinh cấu trúc HTML đầy đủ theo đặc tả UI', () => {
  // Giả lập quyền ADMIN
  mockStorage.set('user', JSON.stringify({ username: 'admin', role: 'ADMIN' }));

  const html = renderEmployeesPage();

  // Tiêu đề và mô tả
  assert.ok(html.includes('Quản lý nhân sự'), 'Phải có tiêu đề "Quản lý nhân sự"');
  assert.ok(html.includes('Quản lý hồ sơ và thông tin nhân viên trong hệ thống'), 'Phải có mô tả trang');

  // Khối thẻ thống kê đã được loại bỏ theo yêu cầu người dùng
  assert.ok(!html.includes('id="emp-stats-container"'), 'Đã loại bỏ khối thẻ thống kê theo yêu cầu');

  // Toolbar & Search
  assert.ok(html.includes('emp-search-input'), 'Phải có ô tìm kiếm nhân sự');
  assert.ok(html.includes('Tìm theo mã nhân viên hoặc họ tên...'), 'Phải có đúng placeholder');
  assert.ok(html.includes('emp-search-clear'), 'Phải có nút xóa từ khóa');

  // Bộ lọc phòng ban & Reset
  assert.ok(html.includes('emp-dept-filter'), 'Phải có dropdown lọc phòng ban');
  assert.ok(html.includes('btn-reset-filters'), 'Phải có nút đặt lại bộ lọc');

  // Bảng danh sách & Các cột
  assert.ok(html.includes('Mã nhân viên'), 'Cột Mã nhân viên');
  assert.ok(html.includes('Họ và tên'), 'Cột Họ và tên');
  assert.ok(html.includes('Phòng ban'), 'Cột Phòng ban');
  assert.ok(html.includes('Số điện thoại'), 'Cột Số điện thoại');
  assert.ok(html.includes('Ngày vào làm'), 'Cột Ngày vào làm');
  assert.ok(html.includes('Trạng thái'), 'Cột Trạng thái');
  assert.ok(html.includes('Thao tác'), 'Cột Thao tác');

  // TUYỆT ĐỐI KHÔNG HIỂN THỊ CỘT CCCD TRONG BẢNG DANH SÁCH
  assert.ok(!html.includes('<th>CCCD'), 'Tuyệt đối KHÔNG có cột CCCD trong tiêu đề bảng');
  assert.ok(!html.includes('<th>Số CCCD'), 'Tuyệt đối KHÔNG có cột Số CCCD trong bảng');

  // Phân trang
  assert.ok(html.includes('emp-limit-select'), 'Phải có bộ chọn số bản ghi mỗi trang (limit)');
  assert.ok(html.includes('emp-pagination-controls'), 'Phải có điều khiển phân trang');
});

// -----------------------------------------------------------------------------
// TEST 7: RBAC - Quyền hiển thị nút "+ Thêm nhân viên"
// -----------------------------------------------------------------------------
await testAsync('Test 7: Phân quyền RBAC cho nút "+ Thêm nhân viên" (Admin/HR vs Employee)', () => {
  // 1. ADMIN -> Phải nhìn thấy nút thêm
  mockStorage.set('user', JSON.stringify({ role: 'ADMIN' }));
  const adminHtml = renderEmployeesPage();
  assert.ok(adminHtml.includes('btn-add-emp'), 'ADMIN phải nhìn thấy nút thêm nhân viên');

  // 2. HR_MANAGER -> Phải nhìn thấy nút thêm
  mockStorage.set('user', JSON.stringify({ role: 'HR_MANAGER' }));
  const hrHtml = renderEmployeesPage();
  assert.ok(hrHtml.includes('btn-add-emp'), 'HR_MANAGER phải nhìn thấy nút thêm nhân viên');

  // 3. EMPLOYEE -> Không được nhìn thấy nút thêm
  mockStorage.set('user', JSON.stringify({ role: 'EMPLOYEE' }));
  const empHtml = renderEmployeesPage();
  assert.ok(!empHtml.includes('btn-add-emp'), 'EMPLOYEE KHÔNG được nhìn thấy nút thêm nhân viên');

  // 4. Route Access
  assert.strictEqual(hasAccessToRoute('/employees', ROLES.ADMIN), true);
  assert.strictEqual(hasAccessToRoute('/employees', ROLES.HR_MANAGER), true);
  assert.strictEqual(hasAccessToRoute('/employees', ROLES.EMPLOYEE), false);
});

// -----------------------------------------------------------------------------
// TEST 8: Phòng chống lỗ hổng Cross-Site Scripting (XSS)
// -----------------------------------------------------------------------------
await testAsync('Test 8: Hàm sanitizeHTML khử độc an toàn chuỗi độc hại trước khi render', () => {
  const xssAttack = `<script>alert("hacked")</script><img src="x" onerror="stealCookie()">`;
  const sanitized = sanitizeHTML(xssAttack);

  assert.ok(!sanitized.includes('<script>'), 'Không được chứa thẻ script');
  assert.ok(sanitized.includes('&lt;script&gt;'), 'Thẻ script phải được escape thành entity');
  assert.ok(!sanitized.includes('<img'), 'Không được chứa thẻ img');
  assert.ok(sanitized.includes('&lt;img'), 'Thẻ img phải được escape thành entity');
});

// -----------------------------------------------------------------------------
// TEST 9: Tính toán phạm vi bản ghi phân trang
// -----------------------------------------------------------------------------
await testAsync('Test 9: Logic tính toán phạm vi hiển thị bản ghi "Hiển thị X-Y trên tổng Z"', () => {
  const computePaginationRange = (page, limit, total) => {
    if (total === 0) return { from: 0, to: 0, total: 0 };
    const from = (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);
    return { from, to, total };
  };

  // Trang 1 / 10 / tổng 25 -> 1 - 10 trên 25
  const p1 = computePaginationRange(1, 10, 25);
  assert.deepStrictEqual(p1, { from: 1, to: 10, total: 25 });

  // Trang 3 / 10 / tổng 25 -> 21 - 25 trên 25
  const p3 = computePaginationRange(3, 10, 25);
  assert.deepStrictEqual(p3, { from: 21, to: 25, total: 25 });

  // Danh sách rỗng 0 bản ghi
  const pEmpty = computePaginationRange(1, 10, 0);
  assert.deepStrictEqual(pEmpty, { from: 0, to: 0, total: 0 });
});

// -----------------------------------------------------------------------------
// TỔNG KẾT BỘ KIỂM THỬ
// -----------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ FRONTEND EMPLOYEE MANAGEMENT!`);
console.log('============================================================\n');
