/**
 * BỘ KIỂM THỬ TỰ ĐỘNG API THÊM NHÂN VIÊN VÀ MÃ HÓA CCCD (AES_ENCRYPT & HMAC-SHA-256)
 * Kiểm thử toàn diện 14 yêu cầu theo mục 7 "Kiểm thử" của Task Description:
 * 1.  Thêm nhân viên với dữ liệu hợp lệ -> 201 Created.
 * 2.  Thiếu họ tên hoặc CCCD -> 400 Bad Request.
 * 3.  CCCD sai định dạng (không phải số hoặc sai độ dài 9/12) -> 400 Bad Request.
 * 4.  Mã nhân viên đã tồn tại -> 409 Conflict (DUPLICATE_EMPLOYEE_CODE).
 * 5.  Số CCCD đã tồn tại (phát hiện qua HMAC-SHA-256) -> 409 Conflict (DUPLICATE_CCCD).
 * 6.  Phòng ban không tồn tại -> 404 Not Found (DEPARTMENT_NOT_FOUND).
 * 7.  Không có JWT -> 401 Unauthorized.
 * 8.  Người dùng không đủ quyền (vai trò EMPLOYEE) -> 403 Forbidden.
 * 9.  Khóa mã hóa chưa được cấu hình -> 500 Internal Server Error (CONFIGURATION_ERROR).
 * 10. Database lỗi -> Không trả SQL hoặc stack trace nhạy cảm.
 * 11. Xác minh CCCD lưu trong database là nhị phân mã hóa AES_ENCRYPT, không phải dạng rõ.
 * 12. Xác minh response trả về không làm lộ CCCD dạng rõ hoặc ciphertext.
 * 13. Kiểm tra tính nhất quán dữ liệu (không có bản ghi mồ côi khi lỗi).
 * 14. Tự động sinh mã nhân viên hợp lệ khi không truyền employeeCode.
 */

import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { ROLES } from '../src/constants/roles.js';
import { query } from '../src/config/database.js';
import { createEmployee } from '../src/controllers/employeeController.js';
import employeeService, { EmployeeError } from '../src/services/employeeService.js';
import employeeRepository from '../src/repositories/employeeRepository.js';
import { validateCccdFormat, maskCccd, computeCccdHmac } from '../src/utils/cccdSecurity.js';
import { authenticateToken } from '../src/middlewares/auth.js';
import { requireRole } from '../src/middlewares/role.js';

let passedTests = 0;
let totalTests = 0;

// Danh sách employee_id được tạo ra để tự động dọn dẹp sau khi kiểm thử
const createdEmployeeIds = [];

function createMockHttp({
  headers = {},
  params = {},
  query = {},
  body = {},
  user = null,
} = {}) {
  const req = {
    headers: { ...headers },
    params: { ...params },
    query: { ...query },
    body: { ...body },
    user,
  };

  const res = {
    statusCode: null,
    responseBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.responseBody = data;
      return this;
    },
  };

  let nextCalled = false;
  let nextError = null;

  const next = (err) => {
    nextCalled = true;
    if (err) nextError = err;
  };

  return {
    req,
    res,
    next,
    getNextCalled: () => nextCalled,
    getNextError: () => nextError,
  };
}

async function runAsyncTest(testName, testFn) {
  totalTests++;
  try {
    await testFn();
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } catch (error) {
    console.error(`  ❌ [FAIL] ${testName}`);
    console.error(`     Chi tiết: ${error.message}\n`);
    throw error;
  }
}

console.log('\n============================================================');
console.log('👤 BẮT ĐẦU CHẠY BỘ KIỂM THỬ THÊM NHÂN VIÊN & MÃ HÓA CCCD (AES)');
console.log('============================================================\n');

try {
  // -----------------------------------------------------------------------------
  // TEST 1: Thêm nhân viên với dữ liệu hợp lệ (201 Created)
  // -----------------------------------------------------------------------------
  await runAsyncTest('Test 1: POST /api/employees tạo nhân viên thành công với dữ liệu hợp lệ', async () => {
    const timestamp = Date.now();
    const testCode = `NVT${timestamp.toString().slice(-4)}`;
    const testCccd = `01234567${timestamp.toString().slice(-4)}`;

    const { req, res, next } = createMockHttp({
      body: {
        employeeCode: testCode,
        fullName: 'Nguyễn Văn Kiểm Thử',
        cccd: testCccd,
        departmentId: 1, // Phòng Kỹ thuật
        phone: '0987111222',
        hireDate: '2026-10-14',
        position: 'Kỹ sư Phần mềm',
        gender: 'Male',
      },
      user: { userId: 1, username: 'admin', role: ROLES.ADMIN },
    });

    await createEmployee(req, res, next);

    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.responseBody.success, true);
    assert.strictEqual(res.responseBody.message, 'Thêm nhân viên thành công');

    const emp = res.responseBody.data;
    assert.ok(emp.employeeId > 0);
    assert.strictEqual(emp.employeeCode, testCode);
    assert.strictEqual(emp.fullName, 'Nguyễn Văn Kiểm Thử');
    assert.strictEqual(emp.departmentId, 1);
    assert.strictEqual(emp.phone, '0987111222');

    // Lưu lại để dọn dẹp sau
    createdEmployeeIds.push(emp.employeeId);
  });

  // -----------------------------------------------------------------------------
  // TEST 2: Thiếu họ tên hoặc CCCD (400 Bad Request)
  // -----------------------------------------------------------------------------
  await runAsyncTest('Test 2: Từ chối yêu cầu thiếu họ tên hoặc thiếu số CCCD (400 Bad Request)', async () => {
    // 2.1 Thiếu fullName
    const { req: req1, res: res1, next: next1 } = createMockHttp({
      body: {
        cccd: '012345678901',
        departmentId: 1,
      },
    });
    await createEmployee(req1, res1, next1);
    assert.strictEqual(res1.statusCode, 400);
    assert.strictEqual(res1.responseBody.errorCode, 'VALIDATION_ERROR');
    assert.ok(res1.responseBody.message.includes('Họ và tên'));

    // 2.2 Thiếu cccd
    const { req: req2, res: res2, next: next2 } = createMockHttp({
      body: {
        fullName: 'Trần Văn Thiếu CCCD',
        departmentId: 1,
      },
    });
    await createEmployee(req2, res2, next2);
    assert.strictEqual(res2.statusCode, 400);
    assert.strictEqual(res2.responseBody.errorCode, 'VALIDATION_ERROR');
    assert.ok(res2.responseBody.message.includes('CCCD'));
  });

  // -----------------------------------------------------------------------------
  // TEST 3: CCCD sai định dạng (400 Bad Request)
  // -----------------------------------------------------------------------------
  await runAsyncTest('Test 3: Từ chối số CCCD sai định dạng độ dài hoặc chứa ký tự chữ (400 Bad Request)', async () => {
    // 3.1 Chứa chữ cái
    const { req: req1, res: res1, next: next1 } = createMockHttp({
      body: {
        fullName: 'Lê Văn Sai CCCD',
        cccd: '01234567890A',
        departmentId: 1,
      },
    });
    await createEmployee(req1, res1, next1);
    assert.strictEqual(res1.statusCode, 400);
    assert.ok(res1.responseBody.message.includes('ký tự số'));

    // 3.2 Sai độ dài (5 chữ số)
    const { req: req2, res: res2, next: next2 } = createMockHttp({
      body: {
        fullName: 'Lê Văn Ngắn CCCD',
        cccd: '12345',
        departmentId: 1,
      },
    });
    await createEmployee(req2, res2, next2);
    assert.strictEqual(res2.statusCode, 400);
    assert.ok(res2.responseBody.message.includes('12 chữ số'));
  });

  // -----------------------------------------------------------------------------
  // TEST 4: Mã nhân viên đã tồn tại (409 Conflict)
  // -----------------------------------------------------------------------------
  await runAsyncTest('Test 4: Báo lỗi xung đột 409 khi mã nhân viên đã được sử dụng', async () => {
    const { req, res, next } = createMockHttp({
      body: {
        employeeCode: 'NV001', // Đã tồn tại trong seed data
        fullName: 'Nguyễn Văn Trùng Mã',
        cccd: '038204999999',
        departmentId: 1,
      },
    });
    await createEmployee(req, res, next);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.responseBody.errorCode, 'DUPLICATE_EMPLOYEE_CODE');
    assert.ok(res.responseBody.message.includes('NV001'));
  });

  // -----------------------------------------------------------------------------
  // TEST 5: CCCD đã tồn tại (409 Conflict phát hiện qua HMAC-SHA-256)
  // -----------------------------------------------------------------------------
  await runAsyncTest('Test 5: Báo lỗi xung đột 409 khi số CCCD đã tồn tại trong CSDL', async () => {
    // Thử dùng lại số CCCD của NV001 ('038204001234')
    const { req, res, next } = createMockHttp({
      body: {
        employeeCode: `NV_TEST_${Date.now().toString().slice(-4)}`,
        fullName: 'Nguyễn Trùng CCCD',
        cccd: '038204001234', // Trùng với NV001
        departmentId: 1,
      },
    });
    await createEmployee(req, res, next);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.responseBody.errorCode, 'DUPLICATE_CCCD');
    assert.ok(res.responseBody.message.includes('CCCD/CMND đã tồn tại'));
  });

  // -----------------------------------------------------------------------------
  // TEST 6: Phòng ban không tồn tại (404 Not Found)
  // -----------------------------------------------------------------------------
  await runAsyncTest('Test 6: Báo lỗi 404 khi departmentId không tồn tại hoặc ngưng hoạt động', async () => {
    const { req, res, next } = createMockHttp({
      body: {
        fullName: 'Nhân Viên Phòng Ảo',
        cccd: '038204888888',
        departmentId: 999999, // Không tồn tại
      },
    });
    await createEmployee(req, res, next);
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.responseBody.errorCode, 'DEPARTMENT_NOT_FOUND');
  });

  // -----------------------------------------------------------------------------
  // TEST 7: Không có JWT (401 Unauthorized)
  // -----------------------------------------------------------------------------
  await runAsyncTest('Test 7: Middleware auth từ chối truy cập khi không có JWT Token (401)', async () => {
    const { req, res, next, getNextCalled } = createMockHttp({
      headers: {}, // Không có Authorization header
    });
    authenticateToken(req, res, next);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.responseBody.errorCode, 'TOKEN_REQUIRED');
    assert.strictEqual(getNextCalled(), false);
  });

  // -----------------------------------------------------------------------------
  // TEST 8: Người dùng không đủ quyền - EMPLOYEE (403 Forbidden)
  // -----------------------------------------------------------------------------
  await runAsyncTest('Test 8: Middleware role từ chối vai trò EMPLOYEE khi tạo nhân viên (403)', async () => {
    const { req, res, next, getNextCalled } = createMockHttp({
      user: { userId: 3, username: 'emp1', role: ROLES.EMPLOYEE },
    });
    const checkRole = requireRole(ROLES.ADMIN, ROLES.HR_MANAGER);
    checkRole(req, res, next);

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.responseBody.errorCode, 'FORBIDDEN');
    assert.strictEqual(getNextCalled(), false);
  });

  // -----------------------------------------------------------------------------
  // TEST 9: Khóa mã hóa chưa được cấu hình (500 Internal Server Error)
  // -----------------------------------------------------------------------------
  await runAsyncTest('Test 9: Service bắn lỗi 500 khi khóa mã hóa CCCD_ENCRYPTION_KEY bị rỗng', async () => {
    await assert.rejects(
      async () => {
        await employeeService.createEmployee(
          {
            fullName: 'Test Không Khóa',
            cccd: '038204777777',
            departmentId: 1,
          },
          { cccdEncryptionKey: '' } // Cố tình truyền key rỗng
        );
      },
      (err) => {
        assert.strictEqual(err.statusCode, 500);
        assert.strictEqual(err.errorCode, 'CONFIGURATION_ERROR');
        return true;
      }
    );
  });

  // -----------------------------------------------------------------------------
  // TEST 10: Xử lý lỗi Database không làm lộ SQL hoặc stack trace
  // -----------------------------------------------------------------------------
  await runAsyncTest('Test 10: Lỗi CSDL được xử lý an toàn không để lộ câu lệnh SQL ra client', async () => {
    const { req, res, next } = createMockHttp({
      body: {
        fullName: 'Test Lỗi SQL',
        cccd: '038204666666',
        departmentId: 1,
      },
    });

    // Giả lập lỗi MySQL ER_DUP_ENTRY uk_employees_ssn_hash
    const dbError = new Error("Duplicate entry 'fake_hash' for key 'uk_employees_ssn_hash'");
    dbError.code = 'ER_DUP_ENTRY';

    // Gọi trực tiếp bắt lỗi trong controller
    const origCreate = employeeService.createEmployee;
    employeeService.createEmployee = async () => {
      throw dbError;
    };

    try {
      await createEmployee(req, res, next);
      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.responseBody.errorCode, 'DUPLICATE_CCCD');
      // Không để lộ câu lệnh SQL gốc
      assert.strictEqual(res.responseBody.message.includes('fake_hash'), false);
    } finally {
      employeeService.createEmployee = origCreate;
    }
  });

  // -----------------------------------------------------------------------------
  // TEST 11: Xác minh CCCD lưu trong CSDL là nhị phân mã hóa AES, giải mã đúng
  // -----------------------------------------------------------------------------
  await runAsyncTest('Test 11: Xác minh CCCD lưu vào CSDL dưới dạng VARBINARY AES_ENCRYPT và giải mã đúng', async () => {
    const timestamp = Date.now();
    const testCode = `NV_AES_${timestamp.toString().slice(-4)}`;
    const originalCccd = `03820455${timestamp.toString().slice(-4)}`;

    const { req, res, next } = createMockHttp({
      body: {
        employeeCode: testCode,
        fullName: 'Nguyễn Văn AES Encrypt',
        cccd: originalCccd,
        departmentId: 1,
      },
    });

    await createEmployee(req, res, next);
    assert.strictEqual(res.statusCode, 201);
    const empId = res.responseBody.data.employeeId;
    createdEmployeeIds.push(empId);

    // Truy vấn trực tiếp bản ghi từ MySQL
    const sql = `
      SELECT 
        employee_id,
        ssn_encrypted,
        ssn_masked,
        ssn_hash,
        AES_DECRYPT(ssn_encrypted, ?) as decrypted_cccd
      FROM employees 
      WHERE employee_id = ?
    `;
    const rows = await query(sql, [env.cccdEncryptionKey, empId]);
    assert.strictEqual(rows.length, 1);

    const record = rows[0];
    // 11.1 ssn_encrypted phải là Buffer/VARBINARY nhị phân, KHÔNG phải chuỗi rõ
    assert.ok(Buffer.isBuffer(record.ssn_encrypted));
    assert.notStrictEqual(record.ssn_encrypted.toString('utf8'), originalCccd);

    // 11.2 AES_DECRYPT với đúng khóa phải trả về số CCCD ban đầu
    assert.strictEqual(record.decrypted_cccd.toString('utf8'), originalCccd);

    // 11.3 ssn_masked phải che 6 số ở giữa
    assert.strictEqual(record.ssn_masked, maskCccd(originalCccd));

    // 11.4 ssn_hash phải khớp với kết quả computeCccdHmac
    assert.strictEqual(record.ssn_hash, computeCccdHmac(originalCccd, env.cccdHmacSecret));
  });

  // -----------------------------------------------------------------------------
  // TEST 12: Xác minh response API tuyệt đối không trả CCCD rõ hoặc ciphertext
  // -----------------------------------------------------------------------------
  await runAsyncTest('Test 12: Xác minh response của POST /api/employees không chứa CCCD rõ hoặc ciphertext', async () => {
    const timestamp = Date.now();
    const rawCccd = `03820444${timestamp.toString().slice(-4)}`;

    const { req, res, next } = createMockHttp({
      body: {
        fullName: 'Nhân Viên Bảo Mật Response',
        cccd: rawCccd,
        departmentId: 1,
      },
    });

    await createEmployee(req, res, next);
    const data = res.responseBody.data;
    createdEmployeeIds.push(data.employeeId);

    // Không tồn tại trường cccd
    assert.strictEqual(data.cccd, undefined);
    // Không tồn tại trường ssnEncrypted hoặc ssn_encrypted
    assert.strictEqual(data.ssnEncrypted, undefined);
    assert.strictEqual(data.ssn_encrypted, undefined);
    // Không tồn tại trường ssnHash
    assert.strictEqual(data.ssnHash, undefined);
    assert.strictEqual(data.ssn_hash, undefined);

    // Chuỗi response JSON không chứa rawCccd
    const jsonStr = JSON.stringify(res.responseBody);
    assert.strictEqual(jsonStr.includes(rawCccd), false);
  });

  // -----------------------------------------------------------------------------
  // TEST 13: Tính nhất quán dữ liệu (không tạo bản ghi mồ côi khi lỗi)
  // -----------------------------------------------------------------------------
  await runAsyncTest('Test 13: Khi xảy ra lỗi kiểm tra nghiệp vụ, không có bản ghi nào bị ghi vào CSDL', async () => {
    const countBeforeRows = await query('SELECT COUNT(*) as total FROM employees');
    const countBefore = countBeforeRows[0].total;

    const { req, res, next } = createMockHttp({
      body: {
        fullName: 'Nhân Viên Hỏng',
        cccd: '123', // Sai độ dài -> Lỗi
        departmentId: 1,
      },
    });

    await createEmployee(req, res, next);
    assert.strictEqual(res.statusCode, 400);

    const countAfterRows = await query('SELECT COUNT(*) as total FROM employees');
    const countAfter = countAfterRows[0].total;

    // Tổng số lượng nhân viên giữ nguyên
    assert.strictEqual(countBefore, countAfter);
  });

  // -----------------------------------------------------------------------------
  // TEST 14: Tự động sinh mã nhân viên khi không truyền employeeCode
  // -----------------------------------------------------------------------------
  await runAsyncTest('Test 14: Tự động sinh mã nhân viên hợp lệ (NVxxx) khi client để trống employeeCode', async () => {
    const timestamp = Date.now();
    const { req, res, next } = createMockHttp({
      body: {
        fullName: 'Nhân Viên Tự Sinh Mã',
        cccd: `03820433${timestamp.toString().slice(-4)}`,
        departmentId: 1,
      },
    });

    await createEmployee(req, res, next);
    assert.strictEqual(res.statusCode, 201);
    const emp = res.responseBody.data;
    createdEmployeeIds.push(emp.employeeId);

    assert.ok(emp.employeeCode);
    assert.ok(/^NV\d+$/.test(emp.employeeCode));
  });

} finally {
  // Dọn dẹp dữ liệu kiểm thử
  if (createdEmployeeIds.length > 0) {
    for (const id of createdEmployeeIds) {
      try {
        await employeeRepository.deleteById(id);
      } catch {}
    }
  }
}

console.log('\n============================================================');
console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ THÊM NHÂN VIÊN & MÃ HÓA CCCD!`);
console.log('============================================================\n');

process.exit(0);

