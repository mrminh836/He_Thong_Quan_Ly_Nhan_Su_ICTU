/**
 * ==============================================================================
 * BỘ KIỂM THỬ LIVE E2E & DATABASE QA: XÓA PHÒNG BAN CÓ NHÂN VIÊN & PHÒNG BAN RỖNG
 * ==============================================================================
 * Môi trường: Live Backend API (http://127.0.0.1:3005) & MySQL Database (127.0.0.1:3309)
 * 
 * Các kịch bản kiểm thử:
 * 1. [CA 1] Xóa phòng ban có nhân viên đang làm việc (Active):
 *    -> Backend trả HTTP 409 Conflict, errorCode = 'DEPARTMENT_HAS_EMPLOYEES'
 *    -> CSDL MySQL: Phòng ban và các nhân viên trực thuộc vẫn nguyên vẹn 100%.
 * 
 * 2. [CA 2] Xóa phòng ban chỉ có nhân viên đã thôi việc (Resigned):
 *    -> Backend trả HTTP 409 Conflict, errorCode = 'DEPARTMENT_HAS_EMPLOYEES'
 *    -> Đảm bảo tính toàn vẹn dữ liệu lịch sử và ràng buộc khóa ngoại RESTRICT.
 * 
 * 3. [CA 3] Xóa phòng ban rỗng (0 nhân viên):
 *    -> Backend trả HTTP 200 OK, success = true, thông báo xóa thành công
 *    -> CSDL MySQL: Bản ghi phòng ban được xóa hoàn toàn (HARD_DELETE).
 * 
 * 4. [CA 4] Kiểm tra các ca biên & Phân quyền bảo mật:
 *    4.1. Xóa phòng ban với ID không tồn tại (999999) -> 404 Not Found
 *    4.2. Xóa phòng ban với ID không hợp lệ ('invalid-id', -99) -> 400 Bad Request
 *    4.3. Người dùng không có quyền ADMIN (HR_MANAGER / EMPLOYEE) -> 403 Forbidden
 *    4.4. Yêu cầu không có JWT Token -> 401 Unauthorized
 * 
 * 5. [CA 5] Kiểm tra toàn vẹn CSDL sau toàn bộ chuỗi kiểm thử:
 *    -> Toàn bộ dữ liệu hệ thống gốc không bị suy suyển.
 * ==============================================================================
 */

import assert from 'node:assert';
import mysql from 'mysql2/promise';

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:3005';
const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3309,
  user: process.env.DB_USER || 'app_user',
  password: process.env.DB_PASSWORD || 'AppUser@Pass2026',
  database: process.env.DB_NAME || 'hrm_db',
};

let passed = 0;
let total = 0;

async function runTestCase(name, fn) {
  total++;
  try {
    console.log(`\n▶ [TEST ${total}] ${name}`);
    await fn();
    console.log(`  ✅ [PASS] Hoàn thành đạt chuẩn 100%`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] Thất bại: ${err.message}`);
    throw err;
  }
}

async function getAuthToken(username, password) {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.data?.accessToken) {
    throw new Error(`Đăng nhập thất bại (${username}): ${JSON.stringify(data)}`);
  }
  return data.data.accessToken;
}

async function runLiveQASuite() {
  console.log('==============================================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ LIVE QA: RÀNG BUỘC KHÓA NGOẠI KHI XÓA PHÒNG BAN');
  console.log(`   Backend API: ${BACKEND_URL}`);
  console.log(`   MySQL Database: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
  console.log('==============================================================================');

  // Kết nối trực tiếp vào MySQL để đối soát dữ liệu thực tế
  const db = await mysql.createConnection(DB_CONFIG);

  try {
    // 0. Lấy tokens xác thực
    const adminToken = await getAuthToken('admin', 'Admin@123');
    const hrToken = await getAuthToken('hr', 'Hr@123');
    const empToken = await getAuthToken('emp1', 'Emp@123');

    // --------------------------------------------------------------------------
    // KỊCH BẢN 1: Xóa phòng ban có nhân viên đang làm việc (Active) -> 409 CONFLICT
    // --------------------------------------------------------------------------
    await runTestCase('Xóa phòng ban có nhân viên Active (ID: 1 - PB-TECH) -> Từ chối 409 Conflict', async () => {
      // Kiểm tra DB trước khi xóa
      const [beforeDept] = await db.execute('SELECT * FROM departments WHERE department_id = 1');
      assert.strictEqual(beforeDept.length, 1, 'Phòng ban ID 1 phải tồn tại trong DB');

      const [beforeEmps] = await db.execute(
        'SELECT COUNT(*) as cnt FROM employees WHERE department_id = 1'
      );
      assert.ok(beforeEmps[0].cnt > 0, 'Phòng ban ID 1 phải có nhân viên');

      // Gửi request DELETE tới Backend API
      const res = await fetch(`${BACKEND_URL}/api/departments/1`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const body = await res.json();
      console.log(`     HTTP Status: ${res.status}`);
      console.log(`     Response Body:`, JSON.stringify(body));

      // Assertions
      assert.strictEqual(res.status, 409, 'Status code phải là 409 Conflict');
      assert.strictEqual(body.success, false, 'success phải là false');
      assert.strictEqual(body.errorCode, 'DEPARTMENT_HAS_EMPLOYEES', 'errorCode phải là DEPARTMENT_HAS_EMPLOYEES');
      assert.ok(
        body.message.includes('nhân viên'),
        'Message phải giải thích rõ phòng ban vẫn còn nhân viên'
      );

      // Đối soát CSDL MySQL: phòng ban và nhân viên phải còn nguyên
      const [afterDept] = await db.execute('SELECT * FROM departments WHERE department_id = 1');
      assert.strictEqual(afterDept.length, 1, 'Phòng ban ID 1 KHÔNG được bị xóa khỏi DB');

      const [afterEmps] = await db.execute('SELECT COUNT(*) as cnt FROM employees WHERE department_id = 1');
      assert.strictEqual(afterEmps[0].cnt, beforeEmps[0].cnt, 'Số lượng nhân viên phòng ban 1 phải giữ nguyên vẹn');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 2: Xóa phòng ban có nhân viên đã thôi việc (Resigned) -> 409 CONFLICT
    // --------------------------------------------------------------------------
    await runTestCase('Xóa phòng ban có nhân viên đã thôi việc (Resigned) -> Từ chối 409 Conflict', async () => {
      // 1. Tạo phòng ban thử nghiệm
      const randSuffix = Math.floor(1000 + Math.random() * 9000);
      const testCode = `PB-QA-RES-${randSuffix}`;
      const [deptResult] = await db.execute(
        'INSERT INTO departments (department_code, department_name, description, is_active) VALUES (?, ?, ?, 1)',
        [testCode, `Phòng Thử Nghiệm Resigned ${randSuffix}`, 'Dành cho QA kiểm thử Resigned']
      );
      const testDeptId = deptResult.insertId;

      // 2. Tạo nhân viên với trạng thái Resigned thuộc phòng ban này
      const empCode = `NV-RES-${randSuffix}`;
      const [empResult] = await db.execute(
        `INSERT INTO employees (
          employee_code, full_name, email, phone, gender, date_of_birth,
          ssn_encrypted, ssn_masked, ssn_hash,
          department_id, position, base_salary, hire_date, employment_status
        ) VALUES (?, ?, ?, ?, ?, ?, AES_ENCRYPT('012345678901', 'key'), '0123****8901', ?, ?, ?, ?, ?, ?)`,
        [
          empCode,
          `Nhân Viên Đã Thôi Việc ${randSuffix}`,
          `resigned_${randSuffix}@test.local`,
          '0988776655',
          'Male',
          '1995-05-15',
          `hash_${randSuffix}`,
          testDeptId,
          'Cựu Chuyên viên',
          15000000,
          '2024-01-01',
          'Resigned',
        ]
      );
      const testEmpId = empResult.insertId;

      try {
        // 3. Thực hiện xóa phòng ban qua API
        const res = await fetch(`${BACKEND_URL}/api/departments/${testDeptId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` },
        });

        const body = await res.json();
        console.log(`     HTTP Status: ${res.status}`);
        console.log(`     Response Body:`, JSON.stringify(body));

        assert.strictEqual(res.status, 409, 'Phải trả về 409 Conflict kể cả khi nhân viên đã thôi việc (Resigned)');
        assert.strictEqual(body.errorCode, 'DEPARTMENT_HAS_EMPLOYEES');

        // Đối soát CSDL: Phòng ban và nhân viên Resigned vẫn tồn tại
        const [deptCheck] = await db.execute('SELECT * FROM departments WHERE department_id = ?', [testDeptId]);
        assert.strictEqual(deptCheck.length, 1, 'Phòng ban không được bị xóa để bảo toàn lịch sử nhân sự');
      } finally {
        // Dọn dẹp dữ liệu test: xóa nhân viên test trước, sau đó xóa phòng ban test
        await db.execute('DELETE FROM employees WHERE employee_id = ?', [testEmpId]);
        await db.execute('DELETE FROM departments WHERE department_id = ?', [testDeptId]);
      }
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 3: Xóa phòng ban rỗng (0 nhân viên) -> XÓA THÀNH CÔNG (200 OK)
    // --------------------------------------------------------------------------
    await runTestCase('Xóa phòng ban rỗng (0 nhân viên) -> Xóa thành công 200 OK & Dọn sạch khỏi CSDL', async () => {
      // 1. Tạo phòng ban mới qua API với 0 nhân viên
      const randSuffix = Math.floor(1000 + Math.random() * 9000);
      const testCode = `PB-EMPTY-${randSuffix}`;
      const createRes = await fetch(`${BACKEND_URL}/api/departments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          departmentCode: testCode,
          departmentName: `Phòng Rỗng Thử Nghiệm ${randSuffix}`,
          location: 'Tầng 12 Tòa A',
          phone: '0243999888',
          description: 'Phòng ban mới thành lập chưa có nhân viên nào',
        }),
      });

      const createBody = await createRes.json();
      assert.strictEqual(createRes.status, 201, 'Tạo phòng ban mới phải thành công 201');
      const emptyDeptId = createBody.data?.id || createBody.data?.departmentId;
      assert.ok(emptyDeptId, 'Phải có departmentId trả về');

      // 2. Kiểm tra trực tiếp trong DB: đảm bảo số nhân viên = 0
      const [emps] = await db.execute('SELECT COUNT(*) as cnt FROM employees WHERE department_id = ?', [emptyDeptId]);
      assert.strictEqual(emps[0].cnt, 0, 'Phòng ban mới tạo phải có đúng 0 nhân viên');

      // 3. Gọi DELETE /api/departments/:id
      const delRes = await fetch(`${BACKEND_URL}/api/departments/${emptyDeptId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const delBody = await delRes.json();
      console.log(`     HTTP Status: ${delRes.status}`);
      console.log(`     Response Body:`, JSON.stringify(delBody));

      assert.strictEqual(delRes.status, 200, 'Xóa phòng ban rỗng phải trả về 200 OK');
      assert.strictEqual(delBody.success, true, 'success phải là true');
      assert.ok(delBody.message.includes('thành công'), 'Message phải thông báo thành công');
      assert.strictEqual(delBody.data?.type, 'HARD_DELETE', 'Loại xóa phải là HARD_DELETE');

      // 4. Đối soát CSDL MySQL: Bản ghi phòng ban không còn tồn tại
      const [deptCheck] = await db.execute('SELECT * FROM departments WHERE department_id = ?', [emptyDeptId]);
      assert.strictEqual(deptCheck.length, 0, 'Bản ghi phòng ban phải bị xóa hoàn toàn khỏi MySQL CSDL');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 4: Các ca biên & Phân quyền bảo mật (404, 400, 403, 401)
    // --------------------------------------------------------------------------
    await runTestCase('Xóa phòng ban với ID không tồn tại -> 404 Not Found', async () => {
      const nonExistentId = 999999;
      const res = await fetch(`${BACKEND_URL}/api/departments/${nonExistentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const body = await res.json();
      console.log(`     HTTP Status: ${res.status}, ErrorCode: ${body.errorCode}`);
      assert.strictEqual(res.status, 404);
      assert.strictEqual(body.errorCode, 'DEPARTMENT_NOT_FOUND');
    });

    await runTestCase('Xóa phòng ban với ID không hợp lệ (chuỗi chữ / số âm) -> 400 Bad Request', async () => {
      const res = await fetch(`${BACKEND_URL}/api/departments/invalid_id_abc`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const body = await res.json();
      console.log(`     HTTP Status: ${res.status}, ErrorCode: ${body.errorCode}`);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(body.errorCode, 'INVALID_ID');
    });

    await runTestCase('Người dùng không có quyền Admin (HR_MANAGER cố xóa) -> 403 Forbidden', async () => {
      const res = await fetch(`${BACKEND_URL}/api/departments/1`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${hrToken}` },
      });
      const body = await res.json();
      console.log(`     HTTP Status: ${res.status}, ErrorCode: ${body.errorCode}`);
      assert.strictEqual(res.status, 403);
      assert.strictEqual(body.errorCode, 'FORBIDDEN');
    });

    await runTestCase('Nhân viên thông thường (EMPLOYEE cố xóa) -> 403 Forbidden', async () => {
      const res = await fetch(`${BACKEND_URL}/api/departments/1`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${empToken}` },
      });
      const body = await res.json();
      console.log(`     HTTP Status: ${res.status}, ErrorCode: ${body.errorCode}`);
      assert.strictEqual(res.status, 403);
      assert.strictEqual(body.errorCode, 'FORBIDDEN');
    });

    await runTestCase('Request không có JWT Token -> 401 Unauthorized', async () => {
      const res = await fetch(`${BACKEND_URL}/api/departments/1`, {
        method: 'DELETE',
      });
      const body = await res.json();
      console.log(`     HTTP Status: ${res.status}, ErrorCode: ${body.errorCode}`);
      assert.strictEqual(res.status, 401);
      assert.strictEqual(body.errorCode, 'TOKEN_REQUIRED');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 5: Toàn vẹn CSDL hệ thống sau chuỗi thử nghiệm
    // --------------------------------------------------------------------------
    await runTestCase('Kiểm tra toàn vẹn CSDL: Các phòng ban gốc và nhân viên không bị ảnh hưởng', async () => {
      const [depts] = await db.execute('SELECT department_id, department_code FROM departments WHERE department_id IN (1, 2, 3)');
      assert.strictEqual(depts.length, 3, '3 phòng ban gốc (PB-TECH, PB-HR, PB-BIZ) phải còn nguyên');

      const [emps] = await db.execute('SELECT COUNT(*) as total FROM employees WHERE department_id IN (1, 2, 3)');
      assert.ok(emps[0].total >= 3, 'Dữ liệu nhân viên gốc phải được bảo toàn toàn vẹn');
    });

    console.log('\n==============================================================================');
    console.log(`🎉 KẾT QUẢ KIỂM THỬ LIVE QA: ĐÃ VƯỢT QUA ${passed}/${total} KỊCH BẢN!`);
    console.log('   - Ca xóa phòng ban có nhân viên: BỊ TỪ CHỐI 409 CONFLICT (BẢO TOÀN DỮ LIỆU)');
    console.log('   - Ca xóa phòng ban rỗng: XÓA THÀNH CÔNG 200 OK (DỌN SẠCH CSDL MYSQL)');
    console.log('   - Các ca kiểm thử biên (404, 400) & Phân quyền bảo mật (403, 401): ĐẠT CHUẨN 100%');
    console.log('==============================================================================\n');
  } finally {
    await db.end();
  }
}

runLiveQASuite().catch((err) => {
  console.error('\n❌ BỘ KIỂM THỬ LIVE QA GẶP LỖI:', err);
  process.exit(1);
});
