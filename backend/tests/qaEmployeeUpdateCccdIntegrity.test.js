/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG QA: TOÀN VẸN DỮ LIỆU CCCD KHI CẬP NHẬT NHÂN VIÊN (HRM-206)
 * ==============================================================================
 * Mục tiêu kiểm thử chuyên sâu:
 * 1. Xác thực API PUT /api/employees/:id cập nhật chức vụ, lương, SĐT.
 * 2. Xác nhận 100% BẢO TOÀN TRƯỜNG CCCD MÃ HÓA (ssn_encrypted, ssn_hash, ssn_masked).
 * 3. Kiểm tra tính bất biến của ciphertext trước và sau nhiều lần cập nhật (Bit-by-bit check).
 * 4. Kiểm tra tính đúng đắn khi giải mã AES-256 sau khi cập nhật thông tin nhân viên.
 * 5. Chống can thiệp trái phép (Tampering): Cố ý gửi cccd, ssn_encrypted, ssn_hash qua PUT -> Bị phớt lờ.
 * 6. Kiểm tra Response Hygiene: PUT và GET list tuyệt đối không rò rỉ CCCD hoặc ciphertext.
 * 7. Kiểm tra phân quyền RBAC và chống tấn công SQL Injection.
 * ==============================================================================
 */

import assert from 'node:assert';
import http from 'node:http';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

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

async function runTestSuite() {
  console.log('\n============================================================');
  console.log('🛡️  BẮT ĐẦU CHẠY BỘ KIỂM THỬ QA: BẢO TOÀN DỮ LIỆU CCCD KHI CẬP NHẬT NHÂN VIÊN');
  console.log('   (API PUT /api/employees/:id & Ràng buộc bảo mật AES-256 CCCD)');
  console.log('============================================================\n');

  // Kết nối Database trực tiếp để đối soát bit-by-bit
  const dbConn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
  });

  // 1. Chuẩn bị Authentication Tokens
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

  // 2. Tạo nhân viên thử nghiệm phục vụ kiểm thử QA với số CCCD cụ thể
  const testCccd = '038204007788';
  const testSuffix = Math.floor(1000 + Math.random() * 9000);
  const testEmpCode = `NV-QA-${testSuffix}`;

  const createRes = await request('/employees', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      employeeCode: testEmpCode,
      fullName: 'Nguyễn Văn QA Bảo Mật',
      cccd: testCccd,
      departmentId: 1,
      position: 'QA Security Specialist',
      baseSalary: 18500000,
      phone: '0912345678',
      email: `qa_security_${testSuffix}@ictu.edu.vn`,
      hireDate: '2024-02-01',
    },
  });

  assert.strictEqual(createRes.statusCode, 201, 'Tạo nhân sự QA thử nghiệm thành công');
  const testEmpId = createRes.body.data.employeeId;
  console.log(`ℹ️ [Setup] Đã khởi tạo nhân sự kiểm thử ID=${testEmpId} (${testEmpCode}) với CCCD=${testCccd}`);

  // 3. Đọc dữ liệu mã hóa ban đầu trực tiếp từ Database
  async function getDbCccdState(empId) {
    const [rows] = await dbConn.query(
      `SELECT employee_id, HEX(ssn_encrypted) AS hex_cipher, ssn_hash, ssn_masked, position, base_salary, phone
       FROM employees WHERE employee_id = ?`,
      [empId]
    );
    return rows[0];
  }

  const initialDbState = await getDbCccdState(testEmpId);
  assert.ok(initialDbState.hex_cipher, 'ssn_encrypted ban đầu phải tồn tại và có giá trị binary/hex');
  assert.ok(initialDbState.ssn_hash, 'ssn_hash ban đầu phải tồn tại');
  assert.ok(initialDbState.ssn_masked, 'ssn_masked ban đầu phải tồn tại');

  console.log(`ℹ️ [Baseline] HEX(ssn_encrypted) độ dài ${initialDbState.hex_cipher.length} ký tự, ssn_hash: ${initialDbState.ssn_hash.slice(0, 16)}...`);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: CẬP NHẬT CẢ 3 TRƯỜNG VÀ KIỂM TRA BẢO TOÀN CCCD TRONG DATABASE
    // -------------------------------------------------------------------------
    await test('Test 1: Cập nhật Chức vụ, Lương, SĐT -> Dữ liệu CCCD trong Database giữ nguyên 100% bit-by-bit', async () => {
      const updateRes = await request(`/employees/${testEmpId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          position: 'Senior QA Lead',
          salary: 28000000,
          phone: '0987654321',
        },
      });

      assert.strictEqual(updateRes.statusCode, 200);
      assert.strictEqual(updateRes.body.success, true);
      assert.strictEqual(updateRes.body.data.position, 'Senior QA Lead');
      assert.strictEqual(Number(updateRes.body.data.baseSalary), 28000000);
      assert.strictEqual(updateRes.body.data.phone, '0987654321');

      // Đối soát trực tiếp trong Database
      const currentDb = await getDbCccdState(testEmpId);
      assert.strictEqual(currentDb.hex_cipher, initialDbState.hex_cipher, 'Ciphertext HEX(ssn_encrypted) phải khớp 100% bit-by-bit');
      assert.strictEqual(currentDb.ssn_hash, initialDbState.ssn_hash, 'ssn_hash phải bất biến');
      assert.strictEqual(currentDb.ssn_masked, initialDbState.ssn_masked, 'ssn_masked phải bất biến');
    });

    // -------------------------------------------------------------------------
    // TEST 2: GIẢI MÃ CCCD QUA API GET /api/employees/:id SAU KHI CẬP NHẬT
    // -------------------------------------------------------------------------
    await test('Test 2: Gọi GET /api/employees/:id -> Số CCCD giải mã AES-256 khớp chính xác 100% với CCCD gốc', async () => {
      const detailRes = await request(`/employees/${testEmpId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(detailRes.statusCode, 200);
      assert.strictEqual(detailRes.body.data.cccd, testCccd, 'Số CCCD giải mã trả về phải khớp 100% với số ban đầu');
      assert.strictEqual(detailRes.body.data.position, 'Senior QA Lead', 'Chức vụ mới được phản ánh đúng');
    });

    // -------------------------------------------------------------------------
    // TEST 3: CỐ Ý GỬI TRƯỜNG CCCD MỚI TRONG PAYLOAD PUT (TAMPERING TEST)
    // -------------------------------------------------------------------------
    await test('Test 3: Gửi trường cccd mới ("099999999999") trong payload PUT -> Bị phớt lờ hoàn toàn, CCCD gốc không đổi', async () => {
      const maliciousRes = await request(`/employees/${testEmpId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          position: 'Lead Security Auditor',
          cccd: '099999999999', // Cố tình can thiệp số CCCD
          ssn: '099999999999',
        },
      });

      assert.strictEqual(maliciousRes.statusCode, 200);

      // Kiểm tra DB: ssn_encrypted và ssn_hash tuyệt đối không đổi sang CCCD mới
      const currentDb = await getDbCccdState(testEmpId);
      assert.strictEqual(currentDb.hex_cipher, initialDbState.hex_cipher, 'Ciphertext không được phép thay đổi');
      assert.strictEqual(currentDb.ssn_hash, initialDbState.ssn_hash, 'ssn_hash không được phép thay đổi');

      // Kiểm tra API giải mã lại: vẫn là số CCCD ban đầu
      const verifyRes = await request(`/employees/${testEmpId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(verifyRes.body.data.cccd, testCccd, 'CCCD giải mã vẫn phải là số ban đầu');
      assert.notStrictEqual(verifyRes.body.data.cccd, '099999999999', 'Tuyệt đối không bị ghi đè bởi số giả mạo');
    });

    // -------------------------------------------------------------------------
    // TEST 4: CỐ Ý GỬI TRƯỜNG SSN_ENCRYPTED / SSN_HASH GIẢ MẠO TRONG PUT
    // -------------------------------------------------------------------------
    await test('Test 4: Gửi ssn_encrypted hoặc ssn_hash giả mạo trong PUT -> Hệ thống phớt lờ, CSDL bất biến', async () => {
      const fakeRes = await request(`/employees/${testEmpId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          position: 'Principal Engineer',
          ssn_encrypted: 'FAKE_HEX_DATA_XYZ',
          ssn_hash: 'fake_hash_value_1234567890abcdef',
          ssn_masked: '0999******99',
        },
      });

      assert.strictEqual(fakeRes.statusCode, 200);

      const currentDb = await getDbCccdState(testEmpId);
      assert.strictEqual(currentDb.hex_cipher, initialDbState.hex_cipher);
      assert.strictEqual(currentDb.ssn_hash, initialDbState.ssn_hash);
      assert.strictEqual(currentDb.ssn_masked, initialDbState.ssn_masked);
    });

    // -------------------------------------------------------------------------
    // TEST 5: CẬP NHẬT XÓA SỐ ĐIỆN THOẠI (NULL) KHÔNG LÀM NULL HÓA CÁC CỘT CCCD
    // -------------------------------------------------------------------------
    await test('Test 5: Xóa số điện thoại (phone = null hoặc "") -> SĐT cập nhật NULL, trường CCCD không bị NULL hóa', async () => {
      const clearPhoneRes = await request(`/employees/${testEmpId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          phone: '', // Chuỗi rỗng -> service chuẩn hóa thành null
        },
      });

      assert.strictEqual(clearPhoneRes.statusCode, 200);
      assert.strictEqual(clearPhoneRes.body.data.phone, null, 'Số điện thoại đã được xóa thành null');

      const currentDb = await getDbCccdState(testEmpId);
      assert.strictEqual(currentDb.phone, null);
      assert.ok(currentDb.hex_cipher, 'ssn_encrypted không bị xóa hoặc null');
      assert.strictEqual(currentDb.hex_cipher, initialDbState.hex_cipher);
    });

    // -------------------------------------------------------------------------
    // TEST 6: STRESS UPDATE - CẬP NHẬT LIÊN HOÀN 5 LẦN LIÊN TIẾP
    // -------------------------------------------------------------------------
    await test('Test 6: Cập nhật liên hoàn 5 lần liên tiếp với chức vụ & mức lương khác nhau -> CCCD luôn toàn vẹn', async () => {
      const positions = [
        'Backend Developer',
        'Frontend Specialist',
        'DevOps Architect',
        'Database Administrator',
        'System Security Lead',
      ];

      for (let i = 0; i < positions.length; i++) {
        const salary = 20000000 + i * 2000000;
        const res = await request(`/employees/${testEmpId}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: {
            position: positions[i],
            salary,
          },
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.data.position, positions[i]);

        // Kiểm tra tính toàn vẹn ngay sau mỗi lần cập nhật
        const currentDb = await getDbCccdState(testEmpId);
        assert.strictEqual(
          currentDb.hex_cipher,
          initialDbState.hex_cipher,
          `Ciphertext sau vòng lặp ${i + 1} phải khớp 100%`
        );
      }

      // Xác nhận giải mã cuối cùng
      const finalDetail = await request(`/employees/${testEmpId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(finalDetail.body.data.cccd, testCccd);
    });

    // -------------------------------------------------------------------------
    // TEST 7: CẬP NHẬT MỨC LƯƠNG TỐI ĐA (BOUNDARY SALARY: 9,999,999,999.99)
    // -------------------------------------------------------------------------
    await test('Test 7: Cập nhật mức lương cực đại (9,999,999,999.99 VNĐ) -> Không tràn bộ nhớ sang vùng CCCD', async () => {
      const maxSalaryRes = await request(`/employees/${testEmpId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          salary: 9999999999.99,
        },
      });

      assert.strictEqual(maxSalaryRes.statusCode, 200);
      assert.strictEqual(Number(maxSalaryRes.body.data.baseSalary), 9999999999.99);

      const currentDb = await getDbCccdState(testEmpId);
      assert.strictEqual(currentDb.hex_cipher, initialDbState.hex_cipher);
    });

    // -------------------------------------------------------------------------
    // TEST 8: RESPONSE HYGIENE CỦA API PUT /api/employees/:id
    // -------------------------------------------------------------------------
    await test('Test 8: Response của PUT /api/employees/:id tuyệt đối KHÔNG chứa số CCCD hoặc ciphertext', async () => {
      const updateRes = await request(`/employees/${testEmpId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          position: 'Solution Architect',
        },
      });

      assert.strictEqual(updateRes.statusCode, 200);
      const data = updateRes.body.data;

      // Kiểm tra tất cả các khóa có thể gây lộ dữ liệu CCCD
      const forbiddenKeys = ['cccd', 'ssn', 'ssn_encrypted', 'ssn_hash', 'ssn_masked', 'ssnMasked', 'ssnEncrypted'];
      for (const key of forbiddenKeys) {
        assert.strictEqual(data[key], undefined, `Response của PUT không được chứa khóa nhạy cảm '${key}'`);
      }

      // Kiểm tra toàn bộ chuỗi response JSON không chứa số CCCD rõ
      const rawJson = JSON.stringify(updateRes.body);
      assert.ok(!rawJson.includes(testCccd), 'Response JSON không được chứa số CCCD rõ');
    });

    // -------------------------------------------------------------------------
    // TEST 9: RESPONSE HYGIENE CỦA API GET /api/employees (DANH SÁCH PHÂN TRANG)
    // -------------------------------------------------------------------------
    await test('Test 9: Response của GET /api/employees (danh sách) tuyệt đối không chứa CCCD của nhân sự', async () => {
      const listRes = await request(`/employees?search=${testEmpCode}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(listRes.statusCode, 200);
      const items = listRes.body.data || [];
      assert.ok(items.length > 0, 'Tìm thấy nhân sự trong danh sách');

      const target = items.find((item) => item.employeeCode === testEmpCode);
      assert.ok(target, 'Nhân sự kiểm thử có mặt trong danh sách');

      const forbiddenKeys = ['cccd', 'ssn', 'ssn_encrypted', 'ssn_hash', 'ssn_masked', 'ssnMasked'];
      for (const key of forbiddenKeys) {
        assert.strictEqual(target[key], undefined, `Danh sách nhân viên không được chứa khóa nhạy cảm '${key}'`);
      }
    });

    // -------------------------------------------------------------------------
    // TEST 10: PHÂN QUYỀN RBAC - EMPLOYEE BỊ CHẶN 403, CCCD KHÔNG BỊ CAN THIỆP
    // -------------------------------------------------------------------------
    await test('Test 10: Tài khoản role EMPLOYEE gọi PUT -> Bị từ chối 403 Forbidden, dữ liệu bất biến', async () => {
      const empRes = await request(`/employees/${testEmpId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${empToken}` },
        body: {
          position: 'General Manager',
          salary: 99999999,
        },
      });

      assert.strictEqual(empRes.statusCode, 403, 'EMPLOYEE phải nhận HTTP 403 Forbidden');

      // Xác nhận DB không bị thay đổi
      const currentDb = await getDbCccdState(testEmpId);
      assert.notStrictEqual(currentDb.position, 'General Manager');
      assert.strictEqual(currentDb.hex_cipher, initialDbState.hex_cipher);
    });

    // -------------------------------------------------------------------------
    // TEST 11: CHƯA ĐĂNG NHẬP (KHÔNG TOKEN HOẶC TOKEN SAI) BỊ TỪ CHỐI 401
    // -------------------------------------------------------------------------
    await test('Test 11: Gọi PUT không kèm Bearer Token -> Bị từ chối 401 Unauthorized, CSDL an toàn', async () => {
      const noAuthRes = await request(`/employees/${testEmpId}`, {
        method: 'PUT',
        body: { position: 'Hacker' },
      });
      assert.strictEqual(noAuthRes.statusCode, 401);

      const fakeTokenRes = await request(`/employees/${testEmpId}`, {
        method: 'PUT',
        headers: { Authorization: 'Bearer fake_invalid_jwt_token' },
        body: { position: 'Hacker' },
      });
      assert.strictEqual(fakeTokenRes.statusCode, 401);

      const currentDb = await getDbCccdState(testEmpId);
      assert.notStrictEqual(currentDb.position, 'Hacker');
      assert.strictEqual(currentDb.hex_cipher, initialDbState.hex_cipher);
    });

    // -------------------------------------------------------------------------
    // TEST 12: CHỐNG TẤN CÔNG SQL INJECTION QUA CÁC TRƯỜNG CỦA PUT
    // -------------------------------------------------------------------------
    await test('Test 12: Tấn công SQL Injection qua position ("\' OR 1=1 --") -> Bị chặn / sanitize an toàn', async () => {
      const sqliRes = await request(`/employees/${testEmpId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          position: "' OR 1=1; DROP TABLE employees; --",
        },
      });

      // Hệ thống lưu đúng chuỗi (nhờ Prepared Statements) hoặc từ chối validation
      if (sqliRes.statusCode === 200) {
        assert.strictEqual(sqliRes.body.data.position, "' OR 1=1; DROP TABLE employees; --");
      }

      // Xác minh bảng employees còn nguyên vẹn và CCCD không bị xâm phạm
      const currentDb = await getDbCccdState(testEmpId);
      assert.ok(currentDb, 'Bảng employees vẫn nguyên vẹn');
      assert.strictEqual(currentDb.hex_cipher, initialDbState.hex_cipher);
    });

    // -------------------------------------------------------------------------
    // TEST 13: ĐỐI SOÁT HÀM GIẢI MÃ MYSQL VỚI KẾT QUẢ API BACKEND
    // -------------------------------------------------------------------------
    await test('Test 13: Đối soát hàm AES_DECRYPT trong MySQL và giải mã của Backend -> Kết quả trùng khớp 100%', async () => {
      const [sqlRows] = await dbConn.query(
        `SELECT CAST(AES_DECRYPT(ssn_encrypted, ?) AS CHAR CHARACTER SET utf8mb4) AS decrypted_sql_cccd
         FROM employees WHERE employee_id = ?`,
        [env.cccdEncryptionKey, testEmpId]
      );

      assert.strictEqual(sqlRows.length, 1);
      assert.strictEqual(sqlRows[0].decrypted_sql_cccd, testCccd, 'Giải mã trực tiếp từ MySQL phải ra đúng số CCCD');

      const apiRes = await request(`/employees/${testEmpId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${hrToken}` },
      });
      assert.strictEqual(apiRes.body.data.cccd, sqlRows[0].decrypted_sql_cccd, 'Kết quả giải mã của Backend và MySQL phải đồng nhất');
    });

  } finally {
    // 4. Dọn dẹp dữ liệu thử nghiệm
    console.log('\n--- DỌN DẸP DỮ LIỆU THỬ NGHIỆM ---');
    await dbConn.query('DELETE FROM employees WHERE employee_id = ?', [testEmpId]);
    await dbConn.end();
    console.log(`ℹ️ [Cleanup] Đã xóa nhân sự kiểm thử ID=${testEmpId} (${testEmpCode})`);
  }

  console.log('\n============================================================');
  console.log(`🎉 KẾT QUẢ KIỂM THỬ QA: ĐÃ VƯỢT QUA ${passed}/${total} KỊCH BẢN BẢO VỆ CCCD! (100% PASS)`);
  console.log('============================================================\n');
}

runTestSuite().catch((err) => {
  console.error('LỖI KHÔNG MONG MUỐN KHI CHẠY TEST SUITE:', err);
  process.exit(1);
});
