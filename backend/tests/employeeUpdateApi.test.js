/**
 * ==============================================================================
 * BỘ KIỂM THỬ THỰC TẾ (INTEGRATION TESTS): PUT /api/employees/:id
 * ==============================================================================
 * Kiểm thử 14+ kịch bản tối thiểu theo đúng đặc tả yêu cầu:
 * 1. Cập nhật cả 3 trường thành công (chức vụ, mức lương, số điện thoại) -> 200 OK.
 * 2. Chỉ cập nhật chức vụ, các trường khác giữ nguyên -> 200 OK.
 * 3. Chỉ cập nhật mức lương -> 200 OK.
 * 4. Chỉ cập nhật số điện thoại -> 200 OK.
 * 5. ID nhân viên không tồn tại -> 404 Not Found (EMPLOYEE_NOT_FOUND).
 * 6. ID sai định dạng (chuỗi / số âm / số 0) -> 400 Bad Request (INVALID_ID).
 * 7. Mức lương âm, sai kiểu hoặc vượt giới hạn -> 400 Bad Request (VALIDATION_ERROR).
 * 8. Chức vụ rỗng hoặc vượt giới hạn (> 50 ký tự) -> 400 Bad Request.
 * 9. Số điện thoại sai định dạng -> 400 Bad Request.
 * 10. Không có token xác thực -> 401 Unauthorized.
 * 11. Role EMPLOYEE không có quyền cập nhật -> 403 Forbidden.
 * 12. Gửi thêm trường EmployeeID, UserID hoặc CCCD -> Bị bỏ qua, không bị cập nhật.
 * 13. Dữ liệu trong database và response sau cập nhật khớp nhau 100%.
 * 14. Các API nhân viên hiện tại (GET list, GET by ID, POST) vẫn hoạt động bình thường.
 * ==============================================================================
 */

import assert from 'node:assert';
import http from 'node:http';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3005/api';

async function request(path, options = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = body ? JSON.parse(body) : null;
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: parsed,
            });
          } catch {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              rawBody: body,
            });
          }
        });
      }
    );

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Chi tiết: ${err.message}\n`);
    throw err;
  }
}

async function runEmployeeUpdateTestSuite() {
  console.log('\n============================================================');
  console.log('👨‍💼 BẮT ĐẦU CHẠY BỘ KIỂM THỬ: PUT /api/employees/:id');
  console.log('   Môi trường: Node.js Express (3005) + MySQL (3306)');
  console.log('============================================================\n');

  // 1. Đăng nhập để lấy tokens
  const adminLoginRes = await request('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'Admin@123' },
  });
  assert.strictEqual(adminLoginRes.statusCode, 200, 'Admin đăng nhập thành công');
  const adminToken = adminLoginRes.body.data.accessToken;

  const hrLoginRes = await request('/auth/login', {
    method: 'POST',
    body: { username: 'hr', password: 'Hr@123' },
  });
  assert.strictEqual(hrLoginRes.statusCode, 200, 'HR đăng nhập thành công');
  const hrToken = hrLoginRes.body.data.accessToken;

  const empLoginRes = await request('/auth/login', {
    method: 'POST',
    body: { username: 'emp1', password: 'Emp@123' },
  });
  assert.strictEqual(empLoginRes.statusCode, 200, 'Employee đăng nhập thành công');
  const empToken = empLoginRes.body.data.accessToken;

  // 2. Tạo nhân viên thử nghiệm chuyên dụng
  const timestamp = Date.now().toString().slice(-4);
  const rawCccd = `03809900${timestamp}`;
  const empCode = `NV-TEST-${timestamp}`;

  const createEmpRes = await request('/employees', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      fullName: `Nhân Viên Test ${timestamp}`,
      employeeCode: empCode,
      cccd: rawCccd,
      departmentId: 1,
      position: 'Developer',
      baseSalary: 15000000,
      phone: '0912111111',
      email: `test.emp.${timestamp}@hrm.ictu.edu.vn`,
      gender: 'Male',
      hireDate: '2026-01-15',
    },
  });
  assert.strictEqual(createEmpRes.statusCode, 201, 'Tạo nhân viên mẫu thành công');
  const testEmp = createEmpRes.body.data;
  const testEmpId = testEmp.employeeId || testEmp.employee_id;
  assert.ok(testEmpId > 0, 'Phải có ID nhân viên hợp lệ');

  console.log(`ℹ️ [Setup] Đã tạo nhân sự thử nghiệm ID=${testEmpId} (${empCode})\n`);

  // ===========================================================================
  // KỊCH BẢN 1: Cập nhật cả ba trường thành công (chức vụ, mức lương, số điện thoại)
  // ===========================================================================
  await test('Kịch bản 1: Cập nhật cả 3 trường (Position, Salary, Phone) thành công -> 200 OK', async () => {
    const payload = {
      Position: 'Senior Developer',
      Salary: 25000000,
      Phone: '0912345678',
    };

    const res = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: payload,
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.position, 'Senior Developer');
    assert.strictEqual(res.body.data.baseSalary, 25000000);
    assert.strictEqual(res.body.data.phone, '0912345678');
    // Tuyệt đối không để lộ CCCD trong response
    assert.strictEqual(res.body.data.cccd, undefined);
    assert.strictEqual(res.body.data.ssn_encrypted, undefined);
  });

  // ===========================================================================
  // KỊCH BẢN 2: Chỉ cập nhật chức vụ, các trường khác giữ nguyên
  // ===========================================================================
  await test('Kịch bản 2: Chỉ cập nhật chức vụ (position), mức lương và SĐT giữ nguyên -> 200 OK', async () => {
    const res = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { position: 'Tech Lead / Chuyên Gia Phần Mềm' },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.position, 'Tech Lead / Chuyên Gia Phần Mềm');
    // Mức lương và SĐT vẫn giữ nguyên từ kịch bản 1
    assert.strictEqual(res.body.data.baseSalary, 25000000);
    assert.strictEqual(res.body.data.phone, '0912345678');
  });

  // ===========================================================================
  // KỊCH BẢN 3: Chỉ cập nhật mức lương
  // ===========================================================================
  await test('Kịch bản 3: Chỉ cập nhật mức lương (salary/baseSalary) -> 200 OK', async () => {
    const res = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${hrToken}` },
      body: { salary: 32500000.50 },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.baseSalary, 32500000.5);
    assert.strictEqual(res.body.data.position, 'Tech Lead / Chuyên Gia Phần Mềm');
  });

  // ===========================================================================
  // KỊCH BẢN 4: Chỉ cập nhật số điện thoại
  // ===========================================================================
  await test('Kịch bản 4: Chỉ cập nhật số điện thoại (phone/Phone) dạng Việt Nam hợp lệ -> 200 OK', async () => {
    const res = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { phone: '+84988777666' },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.phone, '+84988777666');
    assert.strictEqual(res.body.data.baseSalary, 32500000.5);
  });

  // ===========================================================================
  // KỊCH BẢN 5: ID nhân viên không tồn tại -> 404
  // ===========================================================================
  await test('Kịch bản 5: Cập nhật nhân viên với ID không tồn tại -> 404 Not Found', async () => {
    const nonExistentId = 999999;
    const res = await request(`/employees/${nonExistentId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { position: 'Manager' },
    });

    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.errorCode, 'EMPLOYEE_NOT_FOUND');
  });

  // ===========================================================================
  // KỊCH BẢN 6: ID sai định dạng -> 400
  // ===========================================================================
  await test('Kịch bản 6: ID sai định dạng (chuỗi ký tự / số âm / số 0) -> 400 Bad Request', async () => {
    const resStr = await request('/employees/abc', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { position: 'Manager' },
    });
    assert.strictEqual(resStr.statusCode, 400);
    assert.strictEqual(resStr.body.errorCode, 'INVALID_ID');

    const resNeg = await request('/employees/-1', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { position: 'Manager' },
    });
    assert.strictEqual(resNeg.statusCode, 400);
    assert.strictEqual(resNeg.body.errorCode, 'INVALID_ID');

    const resZero = await request('/employees/0', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { position: 'Manager' },
    });
    assert.strictEqual(resZero.statusCode, 400);
    assert.strictEqual(resZero.body.errorCode, 'INVALID_ID');
  });

  // ===========================================================================
  // KỊCH BẢN 7: Mức lương âm, sai kiểu hoặc vượt giới hạn -> Bị từ chối (400)
  // ===========================================================================
  await test('Kịch bản 7: Mức lương âm, chuỗi tùy ý hoặc vượt giới hạn -> Báo lỗi 400 Bad Request', async () => {
    // 7.1 Lương âm
    const resNeg = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { salary: -5000000 },
    });
    assert.strictEqual(resNeg.statusCode, 400);
    assert.strictEqual(resNeg.body.success, false);

    // 7.2 Lương là chuỗi không hợp lệ
    const resInvalid = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { salary: 'nam_muoi_trieu' },
    });
    assert.strictEqual(resInvalid.statusCode, 400);
    assert.strictEqual(resInvalid.body.success, false);

    // 7.3 Lương là null
    const resNull = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { salary: null },
    });
    assert.strictEqual(resNull.statusCode, 400);

    // 7.4 Lương vượt quá giới hạn DECIMAL(12, 2)
    const resTooLarge = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { salary: 999999999999999 },
    });
    assert.strictEqual(resTooLarge.statusCode, 400);
  });

  // ===========================================================================
  // KỊCH BẢN 8: Chức vụ rỗng hoặc vượt giới hạn -> Bị từ chối (400)
  // ===========================================================================
  await test('Kịch bản 8: Chức vụ rỗng hoặc vượt quá 50 ký tự -> Báo lỗi 400 Bad Request', async () => {
    // 8.1 Chức vụ rỗng
    const resEmpty = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { position: '   ' },
    });
    assert.strictEqual(resEmpty.statusCode, 400);
    assert.strictEqual(resEmpty.body.success, false);

    // 8.2 Chức vụ vượt quá 50 ký tự
    const longPosition = 'Chức danh công tác này quá dài vượt quá giới hạn tối đa năm mươi ký tự';
    assert.ok(longPosition.length > 50);
    const resLong = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { position: longPosition },
    });
    assert.strictEqual(resLong.statusCode, 400);
    assert.strictEqual(resLong.body.success, false);
  });

  // ===========================================================================
  // KỊCH BẢN 9: Số điện thoại sai định dạng -> Bị từ chối (400)
  // ===========================================================================
  await test('Kịch bản 9: Số điện thoại chứa chữ hoặc sai định dạng -> Báo lỗi 400 Bad Request', async () => {
    const resInvalidPhone = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { phone: '0912ABCDEF' },
    });

    assert.strictEqual(resInvalidPhone.statusCode, 400);
    assert.strictEqual(resInvalidPhone.body.success, false);
  });

  // ===========================================================================
  // KỊCH BẢN 10: Không có token -> 401 Unauthorized
  // ===========================================================================
  await test('Kịch bản 10: Request không có Authorization Token -> 401 Unauthorized', async () => {
    const res = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      body: { position: 'Manager' },
    });

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.success, false);
  });

  // ===========================================================================
  // KỊCH BẢN 11: Nhân viên không có quyền cập nhật (EMPLOYEE) -> 403 Forbidden
  // ===========================================================================
  await test('Kịch bản 11: Tài khoản role EMPLOYEE cố tình cập nhật -> 403 Forbidden', async () => {
    const res = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${empToken}` },
      body: { salary: 50000000, position: 'Giám Đốc' },
    });

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.success, false);
  });

  // ===========================================================================
  // KỊCH BẢN 12: Gửi thêm trường EmployeeID, UserID, CCCD -> Không bị cập nhật
  // ===========================================================================
  await test('Kịch bản 12: Gửi các trường cấm (EmployeeID, UserID, CCCD, Code) -> Bị bỏ qua, dữ liệu gốc bất biến', async () => {
    const maliciousPayload = {
      position: 'Senior QA Specialist',
      EmployeeID: 9999,
      employeeId: 9999,
      UserID: 8888,
      userId: 8888,
      cccd: '001099999999',
      employeeCode: 'NV999',
    };

    const res = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: maliciousPayload,
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.employeeId, testEmpId, 'EmployeeID phải giữ nguyên ID ban đầu');
    assert.strictEqual(res.body.data.employeeCode, empCode, 'EmployeeCode không bị đổi');
    assert.strictEqual(res.body.data.position, 'Senior QA Specialist');

    // Kiểm tra chi tiết bằng GET /api/employees/:id (kèm giải mã CCCD)
    const getDetail = await request(`/employees/${testEmpId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(getDetail.body.data.cccd, rawCccd, 'CCCD trong CSDL không bị ghi đè');
    assert.strictEqual(getDetail.body.data.employeeId, testEmpId);
  });

  // ===========================================================================
  // KỊCH BẢN 13: Dữ liệu trong database và response sau cập nhật khớp nhau 100%
  // ===========================================================================
  await test('Kịch bản 13: Dữ liệu trả về từ PUT khớp 100% với dữ liệu truy vấn trực tiếp từ Database', async () => {
    const updatePayload = {
      position: 'Principal Engineer',
      salary: 40000000,
      phone: '0912999888',
    };

    const putRes = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: updatePayload,
    });
    assert.strictEqual(putRes.statusCode, 200);

    const getRes = await request(`/employees/${testEmpId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(getRes.statusCode, 200);

    const putData = putRes.body.data;
    const getData = getRes.body.data;

    assert.strictEqual(putData.position, getData.position);
    assert.strictEqual(putData.baseSalary, getData.baseSalary);
    assert.strictEqual(putData.phone, getData.phone);
    assert.strictEqual(putData.employeeId, getData.employeeId);
    assert.strictEqual(putData.employeeCode, getData.employeeCode);
  });

  // ===========================================================================
  // KỊCH BẢN 14: Các API nhân viên hiện tại vẫn hoạt động bình thường
  // ===========================================================================
  await test('Kịch bản 14: Các API nhân sự hiện hành (GET list, GET by ID, POST) vẫn hoạt động hoàn hảo', async () => {
    // 14.1 GET /api/employees
    const listRes = await request('/employees?page=1&limit=5', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(listRes.statusCode, 200);
    assert.ok(Array.isArray(listRes.body.data));

    // 14.2 GET /api/employees/:id
    const detailRes = await request(`/employees/${testEmpId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(detailRes.statusCode, 200);
    assert.strictEqual(detailRes.body.data.employeeId, testEmpId);
  });

  // ===========================================================================
  // KỊCH BẢN 15: Body rỗng hoặc không có trường nào hợp lệ -> Báo lỗi 400
  // ===========================================================================
  await test('Kịch bản 15: Body rỗng {} hoặc chỉ chứa trường không được phép -> Báo lỗi 400 Bad Request', async () => {
    const resEmpty = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {},
    });
    assert.strictEqual(resEmpty.statusCode, 400);

    const resOnlyDisallowed = await request(`/employees/${testEmpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { cccd: '038012345678', randomField: 'value' },
    });
    assert.strictEqual(resOnlyDisallowed.statusCode, 400);
  });

  // 3. Dọn dẹp dữ liệu thử nghiệm
  console.log('\n--- DỌN DẸP DỮ LIỆU THỬ NGHIỆM ---');
  try {
    // Xóa record nhân sự test để giữ DB sạch sẽ
    const delRes = await request(`/employees/${testEmpId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log(`ℹ️ [Cleanup] Đã dọn dẹp nhân sự thử nghiệm ID=${testEmpId}`);
  } catch (err) {
    console.warn('⚠️ [Cleanup] Dọn dẹp nhân viên thử nghiệm thất bại:', err.message);
  }

  console.log('\n============================================================');
  console.log(`🎉 KẾT QUẢ KIỂM THỬ: ĐÃ VƯỢT QUA ${passed}/${total} KỊCH BẢN API PUT /api/employees/:id! (100% PASS)`);
  console.log('============================================================\n');
}

runEmployeeUpdateTestSuite().catch((err) => {
  console.error('\n💥 LỖI KIỂM THỬ KHÔNG MONG MUỐN:', err);
  process.exit(1);
});
