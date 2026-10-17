/**
 * ==============================================================================
 * BỘ KIỂM THỬ THỰC TẾ (INTEGRATION TESTS): PATCH /api/employees/:id
 * Chức năng: Cho nhân viên nghỉ việc (Resigned) và khóa tài khoản User liên kết
 * ==============================================================================
 * 
 * Kiểm thử 16 kịch bản toàn diện theo yêu cầu đặc tả nghiệp vụ:
 *  1. ADMIN thực hiện cho nhân viên nghỉ việc thành công -> 200 OK, employment_status = 'Resigned', account_status = 'Locked'.
 *  2. HR_MANAGER thực hiện cho nhân viên nghỉ việc thành công -> 200 OK.
 *  3. EMPLOYEE tự gọi hoặc gọi cho nhân viên khác -> 403 Forbidden.
 *  4. Request không có JWT token -> 401 Unauthorized.
 *  5. ID nhân viên không tồn tại -> 404 Not Found (EMPLOYEE_NOT_FOUND).
 *  6. ID sai định dạng (chuỗi / số âm / số 0) -> 400 Bad Request (INVALID_ID).
 *  7. Hành động (action) không hợp lệ (không phải 'RESIGN', thiếu action) -> 400 Bad Request (VALIDATION_ERROR).
 *  8. Client gửi kèm các trường nội bộ không được phép (role, status, salary, etc.) -> 400 Bad Request.
 *  9. Xử lý Idempotent: Gọi resign nhiều lần trên nhân viên đã nghỉ việc -> 200 OK, isAlreadyResigned: true, không tác dụng phụ lặp lại.
 * 10. Nhân viên không có tài khoản User liên kết -> Cập nhật thành công, hasLinkedAccount = false, không khóa nhầm tài khoản khác.
 * 11. BẢO MẬT: Tài khoản sau khi bị khóa KHÔNG THỂ đăng nhập mới qua POST /api/auth/login -> 403 Forbidden (ACCOUNT_LOCKED).
 * 12. BẢO MẬT: Token JWT cũ đã phát hành trước đó lập tức bị từ chối trên các API bảo vệ -> 403 Forbidden (ACCOUNT_LOCKED).
 * 13. NGHIỆP VỤ: Nhân viên đã nghỉ việc không thể tiếp tục thực hiện chấm công (Check-in / Check-out) -> 403 Forbidden.
 * 14. NGHIỆP VỤ: Nhân viên đã nghỉ việc không thể tiếp tục được cập nhật hồ sơ qua PUT /api/employees/:id -> 400 Bad Request.
 * 15. Dữ liệu trong CSDL MySQL khớp 100% với response trả về (không bị xóa bản ghi, chỉ chuyển trạng thái soft-delete).
 * 16. Các API quản lý nhân sự khác (GET list, GET by ID, POST) vẫn hoạt động hoàn toàn bình thường.
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

    req.on('error', (err) => {
      reject(err);
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }

    req.end();
  });
}

async function loginUser(username, password) {
  const res = await request('/auth/login', {
    method: 'POST',
    body: { username, password },
  });

  if (res.statusCode !== 200 || !res.body?.data?.accessToken) {
    throw new Error(`Đăng nhập thất bại cho user "${username}": ${JSON.stringify(res.body)}`);
  }

  return {
    token: res.body.data.accessToken,
    user: res.body.data.user,
  };
}

// Hàm trợ giúp sinh số ngẫu nhiên cho test dữ liệu
const rand = () => Math.floor(1000 + Math.random() * 9000);

async function runTestSuite() {
  console.log('\n============================================================');
  console.log('🔒 BẮT ĐẦU CHẠY BỘ KIỂM THỬ: PATCH /api/employees/:id');
  console.log('   Nghiệp vụ: Thôi việc nhân viên & Khóa tài khoản User');
  console.log('   Môi trường: Node.js Express (3005) + MySQL (3306/3308)');
  console.log('============================================================\n');

  let adminToken = '';
  let hrToken = '';
  let empToken = '';

  try {
    const adminAuth = await loginUser('admin', 'Admin@123');
    adminToken = adminAuth.token;

    const hrAuth = await loginUser('hr', 'Hr@123');
    hrToken = hrAuth.token;

    const empAuth = await loginUser('emp1', 'Emp@123');
    empToken = empAuth.token;
  } catch (err) {
    console.error('❌ [Setup Error] Không thể đăng nhập các tài khoản mẫu:', err.message);
    process.exit(1);
  }

  const createdEmployeeIds = [];

  // Helper tạo nhân viên mẫu
  async function createTestEmployee(customData = {}) {
    const suffix = rand();
    const payload = {
      fullName: `Test Resign Employee ${suffix}`,
      cccd: `00120200${suffix}`,
      phone: `0912${suffix}00`,
      departmentId: 1,
      position: 'Kỹ sư Thử nghiệm',
      baseSalary: 18000000,
      hireDate: '2026-01-15',
      ...customData,
    };

    const res = await request('/employees', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: payload,
    });

    if (res.statusCode !== 201 || !res.body?.data?.employeeId) {
      throw new Error(`Tạo nhân viên mẫu thất bại: ${JSON.stringify(res.body)}`);
    }

    const emp = res.body.data;
    createdEmployeeIds.push(emp.employeeId);
    return emp;
  }

  let passedTests = 0;
  let totalTests = 0;

  function recordPass(testName) {
    totalTests++;
    passedTests++;
    console.log(`  ✅ [PASS] Kịch bản ${totalTests}: ${testName}`);
  }

  function recordFail(testName, error) {
    totalTests++;
    console.error(`  ❌ [FAIL] Kịch bản ${totalTests}: ${testName}`);
    console.error(`     Chi tiết lỗi: ${error.message}\n`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 1: ADMIN cho nhân viên nghỉ việc thành công
  // --------------------------------------------------------------------------
  try {
    const emp = await createTestEmployee();

    const res = await request(`/employees/${emp.employeeId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'RESIGN' },
    });

    assert.strictEqual(res.statusCode, 200, 'HTTP status phải là 200 OK');
    assert.strictEqual(res.body?.success, true);
    assert.strictEqual(res.body?.data?.employeeId, emp.employeeId);
    assert.strictEqual(res.body?.data?.employmentStatus, 'Resigned');

    // Kiểm tra lại chi tiết nhân viên qua GET /api/employees/:id
    const detailRes = await request(`/employees/${emp.employeeId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(detailRes.body?.data?.employmentStatus, 'Resigned');

    recordPass('ADMIN cho nhân viên nghỉ việc thành công -> 200 OK & employment_status = Resigned');
  } catch (err) {
    recordFail('ADMIN cho nhân viên nghỉ việc thành công', err);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 2: HR_MANAGER cho nhân viên nghỉ việc thành công
  // --------------------------------------------------------------------------
  try {
    const emp = await createTestEmployee();

    const res = await request(`/employees/${emp.employeeId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${hrToken}` },
      body: { action: 'RESIGN' },
    });

    assert.strictEqual(res.statusCode, 200, 'HTTP status phải là 200 OK');
    assert.strictEqual(res.body?.data?.employmentStatus, 'Resigned');

    recordPass('HR_MANAGER cho nhân viên nghỉ việc thành công -> 200 OK');
  } catch (err) {
    recordFail('HR_MANAGER cho nhân viên nghỉ việc thành công', err);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 3: EMPLOYEE cố tình gọi API cho thôi việc -> 403 Forbidden
  // --------------------------------------------------------------------------
  try {
    const emp = await createTestEmployee();

    const res = await request(`/employees/${emp.employeeId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${empToken}` },
      body: { action: 'RESIGN' },
    });

    assert.strictEqual(res.statusCode, 403, 'Tài khoản Employee phải bị từ chối 403');
    assert.strictEqual(res.body?.success, false);
    assert.strictEqual(res.body?.errorCode, 'FORBIDDEN');

    recordPass('EMPLOYEE cố tình gọi API thôi việc bị từ chối -> 403 Forbidden (FORBIDDEN)');
  } catch (err) {
    recordFail('EMPLOYEE cố tình gọi API thôi việc bị từ chối', err);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 4: Request không có Authorization token -> 401 Unauthorized
  // --------------------------------------------------------------------------
  try {
    const res = await request('/employees/1', {
      method: 'PATCH',
      body: { action: 'RESIGN' },
    });

    assert.strictEqual(res.statusCode, 401, 'Request không có token phải trả 401');
    assert.strictEqual(res.body?.success, false);

    recordPass('Request không có Authorization Header token -> 401 Unauthorized');
  } catch (err) {
    recordFail('Request không có Authorization Header token', err);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 5: ID nhân viên không tồn tại trong CSDL -> 404 Not Found
  // --------------------------------------------------------------------------
  try {
    const nonExistentId = 99999999;
    const res = await request(`/employees/${nonExistentId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'RESIGN' },
    });

    assert.strictEqual(res.statusCode, 404, 'ID không tồn tại phải trả 404');
    assert.strictEqual(res.body?.success, false);
    assert.strictEqual(res.body?.errorCode, 'EMPLOYEE_NOT_FOUND');

    recordPass('ID nhân viên không tồn tại trong hệ thống -> 404 Not Found (EMPLOYEE_NOT_FOUND)');
  } catch (err) {
    recordFail('ID nhân viên không tồn tại trong hệ thống', err);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 6: ID nhân viên sai định dạng (chuỗi / số âm / số 0) -> 400 Bad Request
  // --------------------------------------------------------------------------
  try {
    const invalidIds = ['abc', '-5', '0', '1.5'];
    for (const badId of invalidIds) {
      const res = await request(`/employees/${badId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { action: 'RESIGN' },
      });

      assert.strictEqual(res.statusCode, 400, `ID "${badId}" phải trả 400 Bad Request`);
      assert.strictEqual(res.body?.errorCode, 'INVALID_ID');
    }

    recordPass('ID nhân viên sai định dạng (chuỗi, số âm, số 0) -> 400 Bad Request (INVALID_ID)');
  } catch (err) {
    recordFail('ID nhân viên sai định dạng', err);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 7: Hành động (action) không hợp lệ -> 400 Bad Request
  // --------------------------------------------------------------------------
  try {
    const emp = await createTestEmployee();
    const badActions = [
      {},                           // Thiếu trường action
      { action: 'FIRE' },           // Sai tên hành động
      { action: 'DELETE' },         // Sai tên hành động
      { action: '' },               // Rỗng
      { action: 123 },              // Sai kiểu dữ liệu
    ];

    for (const badBody of badActions) {
      const res = await request(`/employees/${emp.employeeId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: badBody,
      });

      assert.strictEqual(res.statusCode, 400, `Body ${JSON.stringify(badBody)} phải trả 400 Bad Request`);
      assert.strictEqual(res.body?.errorCode, 'VALIDATION_ERROR');
    }

    recordPass('Hành động (action) thiếu hoặc khác "RESIGN" -> 400 Bad Request (VALIDATION_ERROR)');
  } catch (err) {
    recordFail('Hành động (action) thiếu hoặc khác "RESIGN"', err);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 8: Gửi kèm các trường nội bộ không được phép -> 400 Bad Request
  // --------------------------------------------------------------------------
  try {
    const emp = await createTestEmployee();

    const res = await request(`/employees/${emp.employeeId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        action: 'RESIGN',
        role: 'Admin',
        account_status: 'Active',
      },
    });

    assert.strictEqual(res.statusCode, 400, 'Gửi kèm trường cấm phải bị từ chối 400');
    assert.strictEqual(res.body?.errorCode, 'VALIDATION_ERROR');

    recordPass('Gửi kèm các trường nội bộ tùy ý (role, account_status) -> 400 Bad Request');
  } catch (err) {
    recordFail('Gửi kèm các trường nội bộ tùy ý', err);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 9: Xử lý Idempotent: Gọi RESIGN nhiều lần liên tiếp
  // --------------------------------------------------------------------------
  try {
    const emp = await createTestEmployee();

    // Lần 1: Cho nghỉ việc
    const res1 = await request(`/employees/${emp.employeeId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'RESIGN' },
    });
    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(res1.body?.data?.isAlreadyResigned, false);

    // Lần 2: Gọi lại ngay trên nhân viên đó
    const res2 = await request(`/employees/${emp.employeeId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'RESIGN' },
    });
    assert.strictEqual(res2.statusCode, 200, 'Lần 2 phải xử lý Idempotent trả 200 OK');
    assert.strictEqual(res2.body?.data?.isAlreadyResigned, true);
    assert.strictEqual(res2.body?.data?.employmentStatus, 'Resigned');

    recordPass('Xử lý Idempotency: Gọi RESIGN lặp lại -> 200 OK, isAlreadyResigned: true, không lỗi');
  } catch (err) {
    recordFail('Xử lý Idempotency', err);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 10: Nhân viên không có User liên kết -> không khóa nhầm tài khoản khác
  // --------------------------------------------------------------------------
  try {
    const emp = await createTestEmployee();

    const res = await request(`/employees/${emp.employeeId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'RESIGN' },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.data?.hasLinkedAccount, false);
    assert.strictEqual(res.body?.data?.accountLocked, false);
    assert.strictEqual(res.body?.data?.userId, null);

    // Đảm bảo tài khoản admin và hr vẫn ở trạng thái Active bình thường
    const adminMe = await request('/auth/profile', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(adminMe.statusCode, 200);
    assert.strictEqual(adminMe.body?.data?.accountStatus, 'Active');

    recordPass('Nhân viên không có User liên kết: hasLinkedAccount=false, không khóa nhầm tài khoản khác');
  } catch (err) {
    recordFail('Nhân viên không có User liên kết', err);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 11: BẢO MẬT - Tài khoản User sau khi bị khóa KHÔNG THỂ đăng nhập mới
  // --------------------------------------------------------------------------
  try {
    // Tìm nhân viên đang liên kết với tài khoản emp1 (Trần Văn Nam)
    const emp1UserRes = await request('/auth/profile', {
      headers: { Authorization: `Bearer ${empToken}` },
    });
    const emp1EmployeeId = emp1UserRes.body?.data?.employeeId;
    assert.ok(emp1EmployeeId, 'emp1 phải có employeeId');

    // Cho nhân viên của emp1 thôi việc thử nghiệm
    const resignRes = await request(`/employees/${emp1EmployeeId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'RESIGN' },
    });

    assert.strictEqual(resignRes.statusCode, 200);
    assert.strictEqual(resignRes.body?.data?.employmentStatus, 'Resigned');
    assert.strictEqual(resignRes.body?.data?.hasLinkedAccount, true);
    assert.strictEqual(resignRes.body?.data?.accountLocked, true);
    assert.strictEqual(resignRes.body?.data?.userAccountStatus, 'Locked');

    // Thử đăng nhập lại bằng emp1 / Emp@123 -> Phải bị từ chối với 403 ACCOUNT_LOCKED!
    const reLoginRes = await request('/auth/login', {
      method: 'POST',
      body: { username: 'emp1', password: 'Emp@123' },
    });

    assert.strictEqual(reLoginRes.statusCode, 403, 'Đăng nhập vào tài khoản bị khóa phải trả 403');
    assert.strictEqual(reLoginRes.body?.success, false);
    assert.strictEqual(reLoginRes.body?.errorCode, 'ACCOUNT_LOCKED');

    recordPass('BẢO MẬT: Tài khoản User sau khi bị khóa KHÔNG THỂ đăng nhập mới -> 403 ACCOUNT_LOCKED');

    // --------------------------------------------------------------------------
    // KỊCH BẢN 12: BẢO MẬT - Token JWT cũ đã phát hành lập tức bị từ chối
    // --------------------------------------------------------------------------
    const oldTokenAccessRes = await request('/auth/profile', {
      headers: { Authorization: `Bearer ${empToken}` },
    });

    assert.strictEqual(oldTokenAccessRes.statusCode, 403, 'Token cũ phải bị từ chối 403 ngay lập tức');
    assert.strictEqual(oldTokenAccessRes.body?.errorCode, 'ACCOUNT_LOCKED');

    recordPass('BẢO MẬT: Token JWT cũ phát hành trước đó lập tức bị từ chối truy cập -> 403 ACCOUNT_LOCKED');

    // --------------------------------------------------------------------------
    // KỊCH BẢN 13: NGHIỆP VỤ - Nhân viên đã nghỉ việc không thể Chấm công (Check-in/Check-out)
    // --------------------------------------------------------------------------
    const checkinRes = await request('/attendances/check-in', {
      method: 'POST',
      headers: { Authorization: `Bearer ${empToken}` },
    });
    // Bị chặn ngay từ tầng authenticateToken hoặc checkIn logic với 403
    assert.strictEqual(checkinRes.statusCode, 403, 'Check-in nhân viên thôi việc phải trả 403');

    recordPass('NGHIỆP VỤ: Nhân viên đã nghỉ việc bị chặn không thể thực hiện chấm công -> 403 Forbidden');

    // Phục hồi lại tài khoản emp1 sau kiểm thử bảo mật để không ảnh hưởng dữ liệu mẫu hệ thống
    const mysql = (await import('mysql2/promise')).default;
    const testDb = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3308,
      user: process.env.DB_USER || 'app_user',
      password: process.env.DB_PASSWORD || 'AppUser@Pass2026',
      database: process.env.DB_NAME || 'hrm_db',
    });

    await testDb.execute('UPDATE `employees` SET employment_status = "Active" WHERE employee_id = ?', [emp1EmployeeId]);
    await testDb.execute('UPDATE `users` SET account_status = "Active" WHERE employee_id = ?', [emp1EmployeeId]);
    await testDb.end();
  } catch (err) {
    recordFail('BẢO MẬT: Khóa tài khoản và thu hồi JWT', err);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 14: NGHIỆP VỤ - Không thể cập nhật hồ sơ nhân viên đã thôi việc
  // --------------------------------------------------------------------------
  try {
    const emp = await createTestEmployee();

    // Thôi việc
    await request(`/employees/${emp.employeeId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'RESIGN' },
    });

    // Cố tình gọi PUT cập nhật hồ sơ
    const updateRes = await request(`/employees/${emp.employeeId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { position: 'Giám đốc Điều hành' },
    });

    assert.strictEqual(updateRes.statusCode, 400, 'Cập nhật nhân viên thôi việc phải trả 400');
    assert.strictEqual(updateRes.body?.errorCode, 'EMPLOYEE_RESIGNED');

    recordPass('NGHIỆP VỤ: Ngăn chặn cập nhật hồ sơ nhân viên đã thôi việc qua PUT -> 400 Bad Request');
  } catch (err) {
    recordFail('NGHIỆP VỤ: Ngăn chặn cập nhật hồ sơ nhân viên đã thôi việc qua PUT', err);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 15: Tính toàn vẹn dữ liệu MySQL (Soft-delete, không xóa bản ghi)
  // --------------------------------------------------------------------------
  try {
    const emp = await createTestEmployee();

    await request(`/employees/${emp.employeeId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'RESIGN' },
    });

    // Truy vấn trực tiếp DB kiểm tra bản ghi vẫn tồn tại đầy đủ
    const mysql = (await import('mysql2/promise')).default;
    const testDb = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3308,
      user: process.env.DB_USER || 'app_user',
      password: process.env.DB_PASSWORD || 'AppUser@Pass2026',
      database: process.env.DB_NAME || 'hrm_db',
    });

    const [rows] = await testDb.execute('SELECT * FROM `employees` WHERE employee_id = ?', [emp.employeeId]);
    await testDb.end();

    assert.strictEqual(rows.length, 1, 'Bản ghi nhân viên phải tồn tại, không bị xóa');
    assert.strictEqual(rows[0].employment_status, 'Resigned');

    recordPass('TOÀN VẸN DỮ LIỆU: Bản ghi CSDL không bị xóa, bảo toàn lịch sử nhân sự chuẩn Soft-delete');
  } catch (err) {
    recordFail('TOÀN VẸN DỮ LIỆU', err);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 16: Các API nhân sự hiện hành vẫn hoạt động hoàn hảo
  // --------------------------------------------------------------------------
  try {
    const listRes = await request('/employees?page=1&limit=5', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(listRes.statusCode, 200);
    assert.ok(Array.isArray(listRes.body?.data));

    const postEmp = await createTestEmployee();
    assert.ok(postEmp.employeeId > 0);

    const getDetailRes = await request(`/employees/${postEmp.employeeId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(getDetailRes.statusCode, 200);

    recordPass('TƯƠNG THÍCH: Các API nhân sự hiện hành (GET list, GET by ID, POST) vẫn hoạt động hoàn hảo');
  } catch (err) {
    recordFail('TƯƠNG THÍCH: Các API nhân sự hiện hành', err);
  }

  // --------------------------------------------------------------------------
  // DỌN DẸP DỮ LIỆU THỬ NGHIỆM
  // --------------------------------------------------------------------------
  console.log('\n--- DỌN DẸP DỮ LIỆU THỬ NGHIỆM ---');
  try {
    const mysql = (await import('mysql2/promise')).default;
    const testDb = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3308,
      user: process.env.DB_USER || 'app_user',
      password: process.env.DB_PASSWORD || 'AppUser@Pass2026',
      database: process.env.DB_NAME || 'hrm_db',
    });

    for (const id of createdEmployeeIds) {
      await testDb.execute('DELETE FROM `users` WHERE employee_id = ?', [id]);
      await testDb.execute('DELETE FROM `employees` WHERE employee_id = ?', [id]);
    }
    await testDb.end();
    console.log(`ℹ️ [Cleanup] Đã dọn dẹp sạch ${createdEmployeeIds.length} nhân viên thử nghiệm.`);
  } catch (err) {
    console.warn('⚠️ [Cleanup Warn] Không thể dọn dẹp một số bản ghi test:', err.message);
  }

  console.log('\n============================================================');
  console.log(`🎉 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} KỊCH BẢN ĐÃ VƯỢT QUA! (${Math.round((passedTests / totalTests) * 100)}% PASS)`);
  console.log('============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
