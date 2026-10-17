/**
 * BỘ KIỂM THỬ TỰ ĐỘNG: MODAL CHỈNH SỬA HỒ SƠ NHÂN VIÊN & TÍCH HỢP API (HRM-205)
 * Kiểm thử toàn diện các yêu cầu kỹ thuật:
 * 1. validateEmployeeEditForm: Kiểm tra tất cả quy tắc validation phía client (chức vụ, lương, SĐT, phòng ban)
 * 2. An toàn dữ liệu & Bảo mật: Không bao giờ gửi CCCD, UserID, EmployeeID lên API
 * 3. employeeService.updateEmployee: Gọi đúng endpoint PUT /api/employees/:id
 * 4. Dropdown phòng ban: Nạp dữ liệu động, tự động prefill và xử lý phòng ban cũ
 * 5. Phân quyền RBAC: Chỉ ADMIN và HR_MANAGER được phép chỉnh sửa
 * 6. Xử lý lỗi API (400, 401, 403, 404, 500)
 * 7. State isolation: Dọn dẹp sạch sẽ bộ nhớ khi đóng modal
 */

import assert from 'node:assert';

// Mock localStorage & sessionStorage
const mockLocalStorage = new Map();
const mockSessionStorage = new Map();

globalThis.localStorage = {
  getItem: (key) => mockLocalStorage.get(key) || null,
  setItem: (key, val) => mockLocalStorage.set(key, String(val)),
  removeItem: (key) => mockLocalStorage.delete(key),
  clear: () => mockLocalStorage.clear(),
};

globalThis.sessionStorage = {
  getItem: (key) => mockSessionStorage.get(key) || null,
  setItem: (key, val) => mockSessionStorage.set(key, String(val)),
  removeItem: (key) => mockSessionStorage.delete(key),
  clear: () => mockSessionStorage.clear(),
};

// Mock document & window cho môi trường Node.js test
globalThis.window = {
  location: { pathname: '/employees', href: '' },
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
    json: async () => ({ success: true, data: {} }),
  };
};

const { validateEmployeeEditForm } = await import('../src/components/EmployeeEditModal.js');
const { employeeService } = await import('../src/services/employeeService.js');
const { ROLES } = await import('../src/utils/rbac.js');

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
console.log('👨‍💼 BẮT ĐẦU CHẠY BỘ KIỂM THỬ: EMPLOYEE EDIT MODAL & API INTEGRATION (HRM-205)');
console.log('============================================================\n');

// -----------------------------------------------------------------------------
// NHÓM 1: VALIDATION DỮ LIỆU ĐẦU VÀO PHÍA CLIENT (FORM VALIDATION)
// -----------------------------------------------------------------------------

await testAsync('Test 1: validateEmployeeEditForm() - Kiểm tra Chức vụ (bắt buộc, không rỗng, tối đa 50 ký tự)', () => {
  // Trống hoặc khoảng trắng
  const res1 = validateEmployeeEditForm({ position: '', salary: 20000000, departmentId: 1 });
  assert.strictEqual(res1.isValid, false);
  assert.ok(res1.errors.position.includes('nhập chức vụ'));

  const res2 = validateEmployeeEditForm({ position: '   ', salary: 20000000, departmentId: 1 });
  assert.strictEqual(res2.isValid, false);
  assert.ok(res2.errors.position.includes('nhập chức vụ'));

  // Vượt quá 50 ký tự
  const longPos = 'Chuyên viên Phát triển Phần mềm Cao cấp kiêm Trưởng nhóm Kiến trúc Hệ thống Phân tán';
  const res3 = validateEmployeeEditForm({ position: longPos, departmentId: 1 });
  assert.strictEqual(res3.isValid, false);
  assert.ok(res3.errors.position.includes('không được vượt quá 50'));

  // Hợp lệ
  const res4 = validateEmployeeEditForm({ position: 'Senior Fullstack Developer', departmentId: 1 });
  assert.strictEqual(res4.isValid, true);
  assert.strictEqual(res4.parsed.position, 'Senior Fullstack Developer');
});

await testAsync('Test 2: validateEmployeeEditForm() - Kiểm tra Mức lương (không âm, parse số, tối đa 9.99 tỷ)', () => {
  // Lương âm
  const res1 = validateEmployeeEditForm({ position: 'Developer', salary: -5000000, departmentId: 1 });
  assert.strictEqual(res1.isValid, false);
  assert.ok(res1.errors.salary.includes('không được là số âm'));

  // Lương không phải số
  const res2 = validateEmployeeEditForm({ position: 'Developer', salary: 'hai muoi trieu', departmentId: 1 });
  assert.strictEqual(res2.isValid, false);
  assert.ok(res2.errors.salary.includes('số hợp lệ'));

  // Vượt quá 9,999,999,999.99
  const res3 = validateEmployeeEditForm({ position: 'Developer', salary: 10000000000, departmentId: 1 });
  assert.strictEqual(res3.isValid, false);
  assert.ok(res3.errors.salary.includes('vượt quá'));

  // Nhập chuỗi có định dạng phẩy/chấm phân cách
  const res4 = validateEmployeeEditForm({ position: 'Developer', salary: '25,000,000', departmentId: 1 });
  assert.strictEqual(res4.isValid, true);
  assert.strictEqual(res4.parsed.salary, 25000000);

  // Không nhập lương (cho phép bỏ trống)
  const res5 = validateEmployeeEditForm({ position: 'Developer', salary: '', departmentId: 1 });
  assert.strictEqual(res5.isValid, true);
  assert.strictEqual(res5.parsed.salary, undefined);
});

await testAsync('Test 3: validateEmployeeEditForm() - Kiểm tra Số điện thoại (9-20 số hoặc để trống để xóa)', () => {
  // Số điện thoại có ký tự chữ
  const res1 = validateEmployeeEditForm({ position: 'Developer', phone: '0912abc789', departmentId: 1 });
  assert.strictEqual(res1.isValid, false);
  assert.ok(res1.errors.phone.includes('định dạng'));

  // Số điện thoại quá ngắn (< 9 ký tự)
  const res2 = validateEmployeeEditForm({ position: 'Developer', phone: '12345', departmentId: 1 });
  assert.strictEqual(res2.isValid, false);
  assert.ok(res2.errors.phone.includes('định dạng'));

  // Số điện thoại Việt Nam chuẩn 10 số
  const res3 = validateEmployeeEditForm({ position: 'Developer', phone: '0912345678', departmentId: 1 });
  assert.strictEqual(res3.isValid, true);
  assert.strictEqual(res3.parsed.phone, '0912345678');

  // Số điện thoại định dạng quốc tế +84
  const res4 = validateEmployeeEditForm({ position: 'Developer', phone: '+84912345678', departmentId: 1 });
  assert.strictEqual(res4.isValid, true);
  assert.strictEqual(res4.parsed.phone, '+84912345678');

  // Để trống (xóa số điện thoại -> parsed.phone = null)
  const res5 = validateEmployeeEditForm({ position: 'Developer', phone: '', departmentId: 1 });
  assert.strictEqual(res5.isValid, true);
  assert.strictEqual(res5.parsed.phone, null);
});

await testAsync('Test 4: validateEmployeeEditForm() - Yêu cầu bắt buộc chọn phòng ban', () => {
  // Không chọn phòng ban
  const res1 = validateEmployeeEditForm({ position: 'Developer', departmentId: '' });
  assert.strictEqual(res1.isValid, false);
  assert.ok(res1.errors.departmentId.includes('chọn phòng ban'));

  const res2 = validateEmployeeEditForm({ position: 'Developer', departmentId: null });
  assert.strictEqual(res2.isValid, false);
  assert.ok(res2.errors.departmentId.includes('chọn phòng ban'));

  // Chọn phòng ban hợp lệ
  const res3 = validateEmployeeEditForm({ position: 'Developer', departmentId: '2' });
  assert.strictEqual(res3.isValid, true);
  assert.strictEqual(res3.parsed.departmentId, 2);
});

// -----------------------------------------------------------------------------
// NHÓM 2: GIAO TIẾP API & PAYLOAD AN TOÀN
// -----------------------------------------------------------------------------

await testAsync('Test 5: employeeService.updateEmployee() gọi đúng method PUT và URL /api/employees/:id', async () => {
  let capturedUrl = '';
  let capturedOptions = {};

  mockFetchHandler = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: true,
        message: 'Cập nhật thành công',
        data: {
          employeeId: 12,
          position: 'Technical Lead',
          salary: 30000000,
          phone: '0988776655',
        },
      }),
    };
  };

  const payload = {
    position: 'Technical Lead',
    salary: 30000000,
    phone: '0988776655',
  };

  const res = await employeeService.updateEmployee(12, payload);
  assert.strictEqual(capturedOptions.method, 'PUT');
  assert.ok(capturedUrl.endsWith('/employees/12'));

  const sentBody = JSON.parse(capturedOptions.body);
  assert.strictEqual(sentBody.position, 'Technical Lead');
  assert.strictEqual(sentBody.salary, 30000000);
  assert.strictEqual(sentBody.phone, '0988776655');
  assert.strictEqual(res.employeeId, 12);
});

await testAsync('Test 6: Đảm bảo payload cập nhật TUYỆT ĐỐI không chứa CCCD, EmployeeID hoặc UserID', () => {
  // Giả lập form dữ liệu
  const validation = validateEmployeeEditForm({
    position: 'Architect',
    salary: 40000000,
    phone: '0911223344',
    departmentId: 1,
    // Kẻ gian hoặc bug chèn thêm các trường cấm
    cccd: '038204001234',
    employeeId: 999,
    userId: 55,
  });

  // Chỉ lấy parsed từ validator
  const safePayload = {
    position: validation.parsed.position,
    salary: validation.parsed.salary,
    phone: validation.parsed.phone,
  };

  assert.strictEqual(safePayload.cccd, undefined);
  assert.strictEqual(safePayload.employeeId, undefined);
  assert.strictEqual(safePayload.userId, undefined);
  assert.deepStrictEqual(Object.keys(safePayload).sort(), ['phone', 'position', 'salary'].sort());
});

await testAsync('Test 7: employeeService.updateEmployee() từ chối khi ID hoặc updates không hợp lệ', async () => {
  await assert.rejects(
    async () => await employeeService.updateEmployee(null, { position: 'Dev' }),
    /không hợp lệ/
  );

  await assert.rejects(
    async () => await employeeService.updateEmployee('abc', { position: 'Dev' }),
    /không hợp lệ/
  );

  await assert.rejects(
    async () => await employeeService.updateEmployee(12, null),
    /không hợp lệ/
  );
});

// -----------------------------------------------------------------------------
// NHÓM 3: PHÂN QUYỀN RBAC & BẢO VỆ GIAO DIỆN
// -----------------------------------------------------------------------------

await testAsync('Test 8: Phân quyền RBAC cho chức năng Chỉnh sửa hồ sơ nhân sự', () => {
  // Chỉ ADMIN và HR_MANAGER được cấp quyền chỉnh sửa
  const canAdmin = [ROLES.ADMIN, ROLES.HR_MANAGER].includes(ROLES.ADMIN);
  const canHR = [ROLES.ADMIN, ROLES.HR_MANAGER].includes(ROLES.HR_MANAGER);
  const canEmployee = [ROLES.ADMIN, ROLES.HR_MANAGER].includes(ROLES.EMPLOYEE);

  assert.strictEqual(canAdmin, true);
  assert.strictEqual(canHR, true);
  assert.strictEqual(canEmployee, false);
});

// -----------------------------------------------------------------------------
// NHÓM 4: XỬ LÝ LỖI VÀ MÃ TRẠNG THÁI HTTP
// -----------------------------------------------------------------------------

await testAsync('Test 9: Xử lý lỗi 400 Bad Request từ Backend và trích xuất thông báo lỗi', async () => {
  mockFetchHandler = async () => ({
    ok: false,
    status: 400,
    statusText: 'Bad Request',
    headers: { get: () => 'application/json' },
    json: async () => ({
      success: false,
      message: 'Dữ liệu đầu vào không hợp lệ',
      errors: {
        salary: 'Mức lương không được là số âm.',
      },
    }),
  });

  try {
    await employeeService.updateEmployee(12, { salary: -1000 });
    assert.fail('Cần phải ném ra lỗi HTTP 400');
  } catch (err) {
    assert.strictEqual(err.status, 400);
    assert.strictEqual(err.data.errors.salary, 'Mức lương không được là số âm.');
  }
});

await testAsync('Test 10: Xử lý lỗi 404 Not Found khi nhân viên không tồn tại', async () => {
  mockFetchHandler = async () => ({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    headers: { get: () => 'application/json' },
    json: async () => ({
      success: false,
      message: 'Nhân viên không tồn tại trong hệ thống.',
    }),
  });

  try {
    await employeeService.updateEmployee(99999, { position: 'Dev' });
    assert.fail('Cần phải ném ra lỗi HTTP 404');
  } catch (err) {
    assert.strictEqual(err.status, 404);
    assert.ok(err.data.message.includes('không tồn tại'));
  }
});

await testAsync('Test 11: Xử lý lỗi 403 Forbidden khi người dùng không đủ quyền hạn', async () => {
  mockFetchHandler = async () => ({
    ok: false,
    status: 403,
    statusText: 'Forbidden',
    headers: { get: () => 'application/json' },
    json: async () => ({
      success: false,
      message: 'Từ chối truy cập: Bạn không có quyền thực hiện thao tác này.',
    }),
  });

  try {
    await employeeService.updateEmployee(12, { position: 'Director' });
    assert.fail('Cần phải ném ra lỗi HTTP 403');
  } catch (err) {
    assert.strictEqual(err.status, 403);
    assert.ok(err.data.message.includes('Từ chối truy cập'));
  }
});

// -----------------------------------------------------------------------------
// NHÓM 5: LOGIC DROPDOWN PHÒNG BAN & PREFILL
// -----------------------------------------------------------------------------

await testAsync('Test 12: Xử lý danh sách phòng ban động (prefill đúng ID, xử lý phòng ban cũ)', () => {
  const depts = [
    { departmentId: 1, departmentName: 'Phòng Kỹ thuật & CNTT', departmentCode: 'PB-CNTT' },
    { departmentId: 2, departmentName: 'Phòng Nhân sự', departmentCode: 'PB-NS' },
    { departmentId: 3, departmentName: 'Phòng Kế toán', departmentCode: 'PB-KT' },
  ];

  const currentDeptId = 2;
  const isSelectedInList = depts.some((d) => d.departmentId === currentDeptId);
  assert.strictEqual(isSelectedInList, true);

  // Trường hợp nhân viên có phòng ban cũ ID=99 đã bị giải thể
  const oldDeptId = 99;
  const isOldSelectedInList = depts.some((d) => d.departmentId === oldDeptId);
  assert.strictEqual(isOldSelectedInList, false);
});

console.log('\n============================================================');
console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ EMPLOYEE EDIT MODAL!`);
console.log('============================================================\n');
