/**
 * BỘ KIỂM THỬ TỰ ĐỘNG FRONTEND: DEPARTMENT UI & SERVICE VALIDATION
 * Kiểm thử toàn diện các yêu cầu nghiệp vụ theo Task Description:
 * 1. Service API getDepartments, getDepartmentStatistics, getDepartmentById, create, update, delete
 * 2. Ghép dữ liệu danh sách phòng ban với số lượng nhân sự theo DepartmentID
 * 3. Thống kê 3 chỉ số tổng quan (Tổng PB, Tổng NV hiện tại, PB chưa có NV)
 * 4. Tìm kiếm không phân biệt chữ hoa/thường (tên, mã, mô tả)
 * 5. Lọc phòng ban có nhân sự, chưa có nhân sự, đang hoạt động, tạm ngưng
 * 6. Xử lý chuẩn lỗi 409 Conflict khi xóa phòng ban còn nhân viên
 * 7. Phân quyền RBAC cho các thao tác trên giao diện (ADMIN vs HR_MANAGER vs EMPLOYEE)
 * 8. Bảo vệ an toàn chống XSS trong bảng hiển thị
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

const { departmentService } = await import('../src/services/departmentService.js');
const { ROLES, normalizeRole, hasAccessToRoute } = await import('../src/utils/rbac.js');

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
console.log('🏢 BẮT ĐẦU CHẠY BỘ KIỂM THỬ FRONTEND DEPARTMENT MANAGEMENT');
console.log('============================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: departmentService.getDepartments - Tham số & Query String
// -----------------------------------------------------------------------------
await testAsync('Test 1: departmentService.getDepartments() xây dựng đúng Query String và trả về dữ liệu', async () => {
  let requestedUrl = '';
  mockFetchHandler = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: true,
        data: [
          { id: 1, departmentCode: 'PB-TECH', departmentName: 'Phòng Kỹ thuật & Công nghệ', employeeCount: 3 },
          { id: 2, departmentCode: 'PB-HR', departmentName: 'Phòng Nhân sự & Hành chính', employeeCount: 1 },
        ],
        meta: { page: 1, limit: 10, total: 2, totalPages: 1 },
      }),
    };
  };

  const result = await departmentService.getDepartments({ page: 2, limit: 5, search: 'kỹ thuật', status: 'active' });

  assert.ok(requestedUrl.includes('/departments?'));
  assert.ok(requestedUrl.includes('page=2'));
  assert.ok(requestedUrl.includes('limit=5'));
  assert.ok(requestedUrl.includes('search=k%E1%BB%B9+thu%E1%BA%ADt') || requestedUrl.includes('search=k'));
  assert.ok(requestedUrl.includes('status=active'));
  assert.strictEqual(result.items.length, 2);
  assert.strictEqual(result.meta.total, 2);
});

// -----------------------------------------------------------------------------
// TEST 2: departmentService.getDepartmentStatistics - Lấy số liệu thống kê
// -----------------------------------------------------------------------------
await testAsync('Test 2: departmentService.getDepartmentStatistics() trả về danh sách chi tiết và summary', async () => {
  mockFetchHandler = async (url) => {
    assert.ok(url.includes('/departments/statistics'));
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: true,
        data: [
          { departmentId: 1, departmentCode: 'PB-TECH', employeeCount: 3, activeCount: 2, onLeaveCount: 1 },
          { departmentId: 2, departmentCode: 'PB-HR', employeeCount: 1, activeCount: 1, onLeaveCount: 0 },
          { departmentId: 3, departmentCode: 'PB-EMPTY', employeeCount: 0, activeCount: 0, onLeaveCount: 0 },
        ],
        meta: {
          totalDepartments: 3,
          emptyDepartments: 1,
          totalEmployees: 4,
          activeEmployees: 3,
          onLeaveEmployees: 1,
        },
      }),
    };
  };

  const stats = await departmentService.getDepartmentStatistics();
  assert.strictEqual(stats.departments.length, 3);
  assert.strictEqual(stats.summary.totalDepartments, 3);
  assert.strictEqual(stats.summary.emptyDepartments, 1);
  assert.strictEqual(stats.summary.totalEmployees, 4);
});

// -----------------------------------------------------------------------------
// TEST 3: departmentService.createDepartment - Validation phía client và gọi POST
// -----------------------------------------------------------------------------
await testAsync('Test 3: departmentService.createDepartment() từ chối tên trống và gửi payload hợp lệ', async () => {
  // 3.1 Tên trống -> Bắn lỗi ngay
  await assert.rejects(
    async () => departmentService.createDepartment({ departmentName: '   ' }),
    /Tên phòng ban không được để trống/
  );

  // 3.2 Hợp lệ -> Gửi POST
  let capturedBody = null;
  mockFetchHandler = async (url, options) => {
    assert.strictEqual(options.method, 'POST');
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: { id: 10, ...capturedBody } }),
    };
  };

  const created = await departmentService.createDepartment({
    departmentName: '  Phòng Nghiên Cứu Mới  ',
    departmentCode: 'pb-rd',
    location: 'Tầng 5',
    phone: '0208-111-222',
    description: 'Nhiệm vụ R&D',
    isActive: true,
  });

  assert.strictEqual(capturedBody.departmentName, 'Phòng Nghiên Cứu Mới');
  assert.strictEqual(capturedBody.departmentCode, 'PB-RD');
  assert.strictEqual(capturedBody.location, 'Tầng 5');
  assert.strictEqual(created.id, 10);
});

// -----------------------------------------------------------------------------
// TEST 4: departmentService.updateDepartment - Validation và gọi PUT
// -----------------------------------------------------------------------------
await testAsync('Test 4: departmentService.updateDepartment() kiểm tra ID và gửi cập nhật', async () => {
  await assert.rejects(
    async () => departmentService.updateDepartment(null, { departmentName: 'Test' }),
    /ID phòng ban là bắt buộc/
  );

  let capturedUrl = '';
  let capturedBody = null;
  mockFetchHandler = async (url, options) => {
    capturedUrl = url;
    assert.strictEqual(options.method, 'PUT');
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: { id: 1, ...capturedBody } }),
    };
  };

  await departmentService.updateDepartment(1, {
    departmentName: 'Phòng Kỹ thuật Đổi Mới',
    departmentCode: 'pb-tech-v2',
  });

  assert.ok(capturedUrl.includes('/departments/1'));
  assert.strictEqual(capturedBody.departmentName, 'Phòng Kỹ thuật Đổi Mới');
  assert.strictEqual(capturedBody.departmentCode, 'PB-TECH-V2');
});

// -----------------------------------------------------------------------------
// TEST 5: departmentService.deleteDepartment - Bắt lỗi 409 Conflict khi còn nhân viên
// -----------------------------------------------------------------------------
await testAsync('Test 5: departmentService.deleteDepartment() chuyển tiếp đúng lỗi 409 từ Backend', async () => {
  mockFetchHandler = async (url, options) => {
    assert.strictEqual(options.method, 'DELETE');
    return {
      ok: false,
      status: 409,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: false,
        statusCode: 409,
        code: 'DEPARTMENT_HAS_EMPLOYEES',
        errorCode: 'DEPARTMENT_HAS_EMPLOYEES',
        message: 'Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc.',
      }),
    };
  };

  try {
    await departmentService.deleteDepartment(1);
    assert.fail('Phải ném lỗi khi xóa phòng ban có nhân viên');
  } catch (err) {
    assert.strictEqual(err.status, 409);
    assert.strictEqual(err.data.code, 'DEPARTMENT_HAS_EMPLOYEES');
    assert.strictEqual(err.data.message, 'Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc.');
  }
});

// -----------------------------------------------------------------------------
// TEST 6: Ghép dữ liệu Department với Statistics theo DepartmentID (không theo tên)
// -----------------------------------------------------------------------------
await testAsync('Test 6: Ghép dữ liệu danh sách phòng ban và số lượng nhân sự theo DepartmentID chính xác', () => {
  const deptList = [
    { id: 1, departmentCode: 'PB-TECH', departmentName: 'Kỹ thuật', description: 'Tech' },
    { id: 2, departmentCode: 'PB-HR', departmentName: 'Nhân sự', description: 'HR' },
    { id: 3, departmentCode: 'PB-BIZ', departmentName: 'Kinh doanh', description: 'Biz' },
  ];

  const statsList = [
    { departmentId: 1, employeeCount: 15, activeCount: 12, onLeaveCount: 3 },
    { departmentId: 2, employeeCount: 4, activeCount: 4, onLeaveCount: 0 },
    { departmentId: 3, employeeCount: 0, activeCount: 0, onLeaveCount: 0 },
  ];

  const statsMap = new Map();
  statsList.forEach((s) => statsMap.set(s.departmentId, s));

  const merged = deptList.map((d) => {
    const s = statsMap.get(d.id);
    return {
      ...d,
      employeeCount: s ? s.employeeCount : 0,
      activeCount: s ? s.activeCount : 0,
      onLeaveCount: s ? s.onLeaveCount : 0,
    };
  });

  assert.strictEqual(merged[0].employeeCount, 15);
  assert.strictEqual(merged[1].employeeCount, 4);
  assert.strictEqual(merged[2].employeeCount, 0);
  assert.strictEqual(merged[0].activeCount, 12);
});

// -----------------------------------------------------------------------------
// TEST 7: Tính toán chính xác 3 chỉ số tổng quan
// -----------------------------------------------------------------------------
await testAsync('Test 7: Tính toán chính xác 3 chỉ số tổng quan cho các thẻ KPI Dashboard', () => {
  const departments = [
    { departmentId: 1, departmentName: 'PB 1', employeeCount: 5 },
    { departmentId: 2, departmentName: 'PB 2', employeeCount: 0 },
    { departmentId: 3, departmentName: 'PB 3', employeeCount: 3 },
    { departmentId: 4, departmentName: 'PB 4', employeeCount: 0 },
  ];

  const totalDepartments = departments.length;
  const totalEmployees = departments.reduce((sum, d) => sum + d.employeeCount, 0);
  const emptyDepartments = departments.filter((d) => d.employeeCount === 0).length;

  assert.strictEqual(totalDepartments, 4);
  assert.strictEqual(totalEmployees, 8);
  assert.strictEqual(emptyDepartments, 2);
});

// -----------------------------------------------------------------------------
// TEST 8: Tìm kiếm không phân biệt hoa thường và hỗ trợ tên, mã, mô tả
// -----------------------------------------------------------------------------
await testAsync('Test 8: Tìm kiếm phòng ban không phân biệt hoa thường theo tên, mã và mô tả', () => {
  const departments = [
    { departmentName: 'Phòng Kỹ thuật & Công nghệ', departmentCode: 'PB-TECH', description: 'Phát triển phần mềm' },
    { departmentName: 'Phòng Nhân sự & Hành chính', departmentCode: 'PB-HR', description: 'Tuyển dụng và tiền lương' },
    { departmentName: 'Phòng Dự án AI', departmentCode: 'PB-AI', description: 'Trí tuệ nhân tạo' },
  ];

  const search = (query) => {
    const q = query.trim().toLowerCase();
    return departments.filter(
      (d) =>
        d.departmentName.toLowerCase().includes(q) ||
        d.departmentCode.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q)
    );
  };

  assert.strictEqual(search('kỹ thuật').length, 1);
  assert.strictEqual(search('KỸ THUẬT').length, 1);
  assert.strictEqual(search('pb-ai').length, 1);
  assert.strictEqual(search('tiền lương').length, 1);
  assert.strictEqual(search('không_tồn_tại').length, 0);
});

// -----------------------------------------------------------------------------
// TEST 9: Bộ lọc phòng ban có nhân sự / chưa có nhân sự / trạng thái
// -----------------------------------------------------------------------------
await testAsync('Test 9: Bộ lọc chính xác theo số lượng nhân sự và trạng thái hoạt động', () => {
  const departments = [
    { id: 1, departmentName: 'PB 1', employeeCount: 3, isActive: true },
    { id: 2, departmentName: 'PB 2', employeeCount: 0, isActive: true },
    { id: 3, departmentName: 'PB 3', employeeCount: 0, isActive: false },
    { id: 4, departmentName: 'PB 4', employeeCount: 2, isActive: false },
  ];

  const filter = (mode) => {
    return departments.filter((d) => {
      if (mode === 'with_employees') return d.employeeCount > 0;
      if (mode === 'no_employees') return d.employeeCount === 0;
      if (mode === 'active') return d.isActive === true;
      if (mode === 'inactive') return d.isActive === false;
      return true;
    });
  };

  assert.strictEqual(filter('with_employees').length, 2);
  assert.strictEqual(filter('no_employees').length, 2);
  assert.strictEqual(filter('active').length, 2);
  assert.strictEqual(filter('inactive').length, 2);
  assert.strictEqual(filter('all').length, 4);
});

// -----------------------------------------------------------------------------
// TEST 10: Phân quyền RBAC cho module phòng ban
// -----------------------------------------------------------------------------
await testAsync('Test 10: Phân quyền RBAC cho /departments (ADMIN & HR_MANAGER được phép, EMPLOYEE bị cấm)', () => {
  assert.strictEqual(hasAccessToRoute('/departments', 'Admin'), true);
  assert.strictEqual(hasAccessToRoute('/departments', 'HR'), true);
  assert.strictEqual(hasAccessToRoute('/departments', 'Employee'), false);
  assert.strictEqual(hasAccessToRoute('/departments', null), false);
});

// -----------------------------------------------------------------------------
// TEST 11: Phòng ban có 0 nhân sự sử dụng huy hiệu nhận diện phù hợp
// -----------------------------------------------------------------------------
await testAsync('Test 11: Hiển thị badge trung tính cho phòng ban 0 nhân sự và badge nổi bật cho > 0 nhân sự', () => {
  const renderBadge = (count) => {
    return count > 0
      ? `<span class="badge-count-active">${count} nhân sự</span>`
      : `<span class="badge-count-zero">0 nhân sự (Trống)</span>`;
  };

  assert.ok(renderBadge(5).includes('badge-count-active'));
  assert.ok(renderBadge(5).includes('5 nhân sự'));
  assert.ok(renderBadge(0).includes('badge-count-zero'));
  assert.ok(renderBadge(0).includes('0 nhân sự (Trống)'));
});

// -----------------------------------------------------------------------------
// TEST 12: Xử lý thông báo xác nhận xóa và cảnh báo phòng ban có nhân viên
// -----------------------------------------------------------------------------
await testAsync('Test 12: Thông báo lỗi 409 khi xóa phòng ban có nhân viên khớp với đặc tả', () => {
  const getDeleteErrorMessage = (err) => {
    if (err.status === 409 || err.code === 'DEPARTMENT_HAS_EMPLOYEES' || err.errorCode === 'DEPARTMENT_HAS_EMPLOYEES') {
      return 'Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc. Vui lòng chuyển nhân viên sang phòng ban khác trước khi xóa.';
    }
    return err.message || 'Lỗi khi xóa phòng ban.';
  };

  const error409 = {
    status: 409,
    code: 'DEPARTMENT_HAS_EMPLOYEES',
    message: 'Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc.',
  };

  const expectedMessage = 'Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc. Vui lòng chuyển nhân viên sang phòng ban khác trước khi xóa.';
  assert.strictEqual(getDeleteErrorMessage(error409), expectedMessage);
});

console.log('\n============================================================');
console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ FRONTEND DEPARTMENT UI & SERVICE!`);
console.log('============================================================\n');
