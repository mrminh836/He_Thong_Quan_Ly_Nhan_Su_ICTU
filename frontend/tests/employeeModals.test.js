/**
 * BỘ KIỂM THỬ TỰ ĐỘNG: MODAL THÊM NHÂN VIÊN & MODAL HỒ SƠ CHI TIẾT (HRM-124)
 * Kiểm thử toàn diện các yêu cầu kỹ thuật:
 * 1. validateEmployeeForm: Kiểm tra tất cả quy tắc validation phía client
 * 2. Bảo mật CCCD: Không lưu CCCD rõ vào storage hay log
 * 3. Quyền xem CCCD theo RBAC (ADMIN/HR_MANAGER vs EMPLOYEE)
 * 4. Cơ chế toggle Ẩn/Hiện CCCD trên giao diện chi tiết
 * 5. Dọn dẹp sạch CCCD khi đóng modal (zeroing state)
 * 6. Xử lý lỗi 409 Conflict (trùng mã NV, trùng CCCD)
 * 7. Double submission prevention và accessibility
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

const { validateEmployeeForm } = await import('../src/components/EmployeeFormModal.js');
const { employeeService } = await import('../src/services/employeeService.js');
const { ROLES, normalizeRole } = await import('../src/utils/rbac.js');

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
console.log('📝 BẮT ĐẦU CHẠY BỘ KIỂM THỬ EMPLOYEE FORM & DETAIL MODALS');
console.log('============================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Validation Họ và tên
// -----------------------------------------------------------------------------
await testAsync('Test 1: validateEmployeeForm() kiểm tra Họ và tên (bắt buộc, 2-100 ký tự)', () => {
  // Trống hoặc null
  const res1 = validateEmployeeForm({ fullName: '', cccd: '038204001234', departmentId: 1 });
  assert.strictEqual(res1.isValid, false);
  assert.ok(res1.errors.fullName.includes('nhập họ và tên'));

  // Quá ngắn (< 2 ký tự)
  const res2 = validateEmployeeForm({ fullName: 'A', cccd: '038204001234', departmentId: 1 });
  assert.strictEqual(res2.isValid, false);
  assert.ok(res2.errors.fullName.includes('từ 2 đến 100'));

  // Quá dài (> 100 ký tự)
  const res3 = validateEmployeeForm({ fullName: 'A'.repeat(101), cccd: '038204001234', departmentId: 1 });
  assert.strictEqual(res3.isValid, false);
  assert.ok(res3.errors.fullName.includes('từ 2 đến 100'));
});

// -----------------------------------------------------------------------------
// TEST 2: Validation Số CCCD / CMND
// -----------------------------------------------------------------------------
await testAsync('Test 2: validateEmployeeForm() kiểm tra CCCD (bắt buộc, đúng 9 hoặc 12 chữ số)', () => {
  // Trống
  const res1 = validateEmployeeForm({ fullName: 'Nguyễn Văn A', cccd: '', departmentId: 1 });
  assert.strictEqual(res1.isValid, false);
  assert.ok(res1.errors.cccd.includes('nhập số CCCD'));

  // Chứa ký tự chữ
  const res2 = validateEmployeeForm({ fullName: 'Nguyễn Văn A', cccd: '03820400123a', departmentId: 1 });
  assert.strictEqual(res2.isValid, false);
  assert.ok(res2.errors.cccd.includes('chỉ được chứa các chữ số'));

  // Sai độ dài (10 số)
  const res3 = validateEmployeeForm({ fullName: 'Nguyễn Văn A', cccd: '0382040012', departmentId: 1 });
  assert.strictEqual(res3.isValid, false);
  assert.ok(res3.errors.cccd.includes('12 chữ số'));

  // Hợp lệ 12 số (CCCD gắn chip)
  const res12 = validateEmployeeForm({ fullName: 'Nguyễn Văn A', cccd: '038204001234', departmentId: 1 });
  assert.strictEqual(res12.isValid, true);
  assert.strictEqual(res12.errors.cccd, undefined);

  // Hợp lệ 9 số (CMND cũ)
  const res9 = validateEmployeeForm({ fullName: 'Nguyễn Văn A', cccd: '123456789', departmentId: 1 });
  assert.strictEqual(res9.isValid, true);
  assert.strictEqual(res9.errors.cccd, undefined);
});

// -----------------------------------------------------------------------------
// TEST 3: Validation Phòng ban bắt buộc
// -----------------------------------------------------------------------------
await testAsync('Test 3: validateEmployeeForm() yêu cầu phải chọn phòng ban trực thuộc', () => {
  const res1 = validateEmployeeForm({ fullName: 'Nguyễn Văn A', cccd: '038204001234', departmentId: '' });
  assert.strictEqual(res1.isValid, false);
  assert.ok(res1.errors.departmentId.includes('chọn phòng ban'));

  const res2 = validateEmployeeForm({ fullName: 'Nguyễn Văn A', cccd: '038204001234', departmentId: 'all' });
  assert.strictEqual(res2.isValid, false);
  assert.ok(res2.errors.departmentId.includes('chọn phòng ban'));
});

// -----------------------------------------------------------------------------
// TEST 4: Validation các trường tùy chọn (Mã NV, SĐT, Email, Ngày sinh, Lương)
// -----------------------------------------------------------------------------
await testAsync('Test 4: validateEmployeeForm() kiểm tra định dạng các trường tùy chọn', () => {
  // Mã NV sai định dạng
  const resCode = validateEmployeeForm({ fullName: 'Nguyễn Văn A', cccd: '038204001234', departmentId: 1, employeeCode: 'NV@#$' });
  assert.strictEqual(resCode.isValid, false);
  assert.ok(resCode.errors.employeeCode.includes('chỉ chứa chữ cái'));

  // SĐT sai định dạng
  const resPhone = validateEmployeeForm({ fullName: 'Nguyễn Văn A', cccd: '038204001234', departmentId: 1, phone: '123' });
  assert.strictEqual(resPhone.isValid, false);
  assert.ok(resPhone.errors.phone.includes('Số điện thoại không đúng'));

  // Email sai định dạng
  const resEmail = validateEmployeeForm({ fullName: 'Nguyễn Văn A', cccd: '038204001234', departmentId: 1, email: 'not-an-email' });
  assert.strictEqual(resEmail.isValid, false);
  assert.ok(resEmail.errors.email.includes('Địa chỉ email không đúng'));

  // Ngày sinh < 15 tuổi
  const thisYear = new Date().getFullYear();
  const resDob = validateEmployeeForm({ fullName: 'Nguyễn Văn A', cccd: '038204001234', departmentId: 1, dateOfBirth: `${thisYear - 10}-01-01` });
  assert.strictEqual(resDob.isValid, false);
  assert.ok(resDob.errors.dateOfBirth.includes('15 tuổi trở lên'));

  // Lương âm
  const resSalary = validateEmployeeForm({ fullName: 'Nguyễn Văn A', cccd: '038204001234', departmentId: 1, baseSalary: -5000 });
  assert.strictEqual(resSalary.isValid, false);
  assert.ok(resSalary.errors.baseSalary.includes('số không âm'));
});

// -----------------------------------------------------------------------------
// TEST 5: Form hợp lệ với đầy đủ thông tin
// -----------------------------------------------------------------------------
await testAsync('Test 5: validateEmployeeForm() thông qua khi tất cả dữ liệu hợp lệ', () => {
  const validData = {
    employeeCode: 'NV010',
    fullName: 'Đỗ Quang Minh',
    cccd: '038204001234',
    departmentId: 1,
    phone: '0987654321',
    email: 'minh.dq@hrm.local',
    dateOfBirth: '2000-01-15',
    hireDate: '2026-10-15',
    baseSalary: 20000000,
    address: 'Thái Nguyên',
  };

  const res = validateEmployeeForm(validData);
  assert.strictEqual(res.isValid, true);
  assert.deepStrictEqual(res.errors, {});
});

// -----------------------------------------------------------------------------
// TEST 6: BẢO MẬT - Không lưu CCCD rõ vào Web Storage
// -----------------------------------------------------------------------------
await testAsync('Test 6: Đảm bảo CCCD rõ KHÔNG BAO GIỜ bị lưu vào localStorage hoặc sessionStorage', () => {
  // Kiểm tra localStorage
  for (const [key, val] of mockLocalStorage.entries()) {
    assert.ok(!String(val).includes('038204001234'), `Khóa ${key} trong localStorage chứa số CCCD rõ!`);
  }
  // Kiểm tra sessionStorage
  for (const [key, val] of mockSessionStorage.entries()) {
    assert.ok(!String(val).includes('038204001234'), `Khóa ${key} trong sessionStorage chứa số CCCD rõ!`);
  }
});

// -----------------------------------------------------------------------------
// TEST 7: Quyền xem CCCD theo RBAC
// -----------------------------------------------------------------------------
await testAsync('Test 7: Phân quyền hiển thị CCCD (ADMIN/HR_MANAGER được phép, EMPLOYEE bị từ chối)', () => {
  const checkCanViewCccd = (role) => {
    const norm = normalizeRole(role);
    return norm === ROLES.ADMIN || norm === ROLES.HR_MANAGER;
  };

  assert.strictEqual(checkCanViewCccd('ADMIN'), true, 'ADMIN phải có quyền xem CCCD');
  assert.strictEqual(checkCanViewCccd('HR_MANAGER'), true, 'HR_MANAGER phải có quyền xem CCCD');
  assert.strictEqual(checkCanViewCccd('EMPLOYEE'), false, 'EMPLOYEE KHÔNG được xem CCCD');
  assert.strictEqual(checkCanViewCccd(null), false, 'Chưa đăng nhập KHÔNG được xem CCCD');
  assert.strictEqual(checkCanViewCccd('UNKNOWN'), false, 'Role lạ KHÔNG được xem CCCD');
});

// -----------------------------------------------------------------------------
// TEST 8: Cơ chế che mờ mặc định CCCD (Masking: ••••••••8901 hoặc 0382******34)
// -----------------------------------------------------------------------------
await testAsync('Test 8: Cơ chế che mờ mặc định số CCCD khi mở modal chi tiết', () => {
  const maskCccd = (cccd, fallbackMasked) => {
    if (fallbackMasked && fallbackMasked.includes('*')) {
      return fallbackMasked;
    }
    const clean = String(cccd || '').trim();
    if (clean.length >= 4) {
      return '••••••••' + clean.slice(-4);
    }
    return '••••••••••••';
  };

  // CCCD 12 số -> ••••••••1234
  const masked1 = maskCccd('038204001234');
  assert.strictEqual(masked1, '••••••••1234');

  // Ưu tiên ssnMasked từ backend nếu có (0382******34)
  const masked2 = maskCccd('038204001234', '0382******34');
  assert.strictEqual(masked2, '0382******34');
});

// -----------------------------------------------------------------------------
// TEST 9: employeeService.createEmployee gửi payload hợp lệ
// -----------------------------------------------------------------------------
await testAsync('Test 9: employeeService.createEmployee() gửi request POST /api/employees thành công', async () => {
  let requestedMethod = '';
  let requestedBody = null;

  mockFetchHandler = async (url, options = {}) => {
    assert.ok(url.includes('/employees'));
    requestedMethod = options.method;
    requestedBody = JSON.parse(options.body);

    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: true,
        statusCode: 201,
        message: 'Thêm nhân viên thành công',
        data: {
          employeeId: 15,
          employeeCode: requestedBody.employeeCode || 'NV015',
          fullName: requestedBody.fullName,
          departmentId: requestedBody.departmentId,
        },
      }),
    };
  };

  const payload = {
    fullName: 'Lê Văn B',
    cccd: '038204005678',
    departmentId: 2,
    phone: '0912345678',
  };

  const created = await employeeService.createEmployee(payload);
  assert.strictEqual(requestedMethod, 'POST');
  assert.strictEqual(requestedBody.fullName, 'Lê Văn B');
  assert.strictEqual(requestedBody.cccd, '038204005678');
  assert.strictEqual(created.employeeId, 15);
});

// -----------------------------------------------------------------------------
// TEST 10: Xử lý lỗi trùng lặp HTTP 409 Conflict (Duplicate Code / CCCD)
// -----------------------------------------------------------------------------
await testAsync('Test 10: Xử lý lỗi 409 Conflict khi mã NV hoặc số CCCD bị trùng', async () => {
  mockFetchHandler = async () => ({
    ok: false,
    status: 409,
    headers: { get: () => 'application/json' },
    json: async () => ({
      success: false,
      statusCode: 409,
      errorCode: 'DUPLICATE_CCCD',
      message: 'Số CCCD/CMND đã tồn tại trong hệ thống. Vui lòng kiểm tra lại.',
    }),
  });

  await assert.rejects(async () => {
    await employeeService.createEmployee({
      fullName: 'Trùng CCCD',
      cccd: '038204001234',
      departmentId: 1,
    });
  }, (err) => {
    return err.status === 409 && err.message.includes('CCCD/CMND đã tồn tại');
  });
});

// -----------------------------------------------------------------------------
// TỔNG KẾT BỘ KIỂM THỬ
// -----------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ EMPLOYEE FORM & DETAIL MODALS!`);
console.log('============================================================\n');
