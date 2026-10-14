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
 *
 * Chạy độc lập hoàn toàn với Mock In-Memory Repository và Crypto AES-128-ECB
 * tương thích 100% với môi trường CI/CD (GitHub Actions) không cần cài đặt MySQL Server.
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { ROLES } from '../src/constants/roles.js';
import { createEmployee } from '../src/controllers/employeeController.js';
import employeeService, { EmployeeError } from '../src/services/employeeService.js';
import employeeRepository from '../src/repositories/employeeRepository.js';
import departmentRepository from '../src/repositories/departmentRepository.js';
import { validateCccdFormat, maskCccd, computeCccdHmac } from '../src/utils/cccdSecurity.js';
import { authenticateToken } from '../src/middlewares/auth.js';
import { requireRole } from '../src/middlewares/role.js';

let passedTests = 0;
let totalTests = 0;

/**
 * Mô phỏng giải thuật sinh khóa và mã hóa AES-128-ECB của MySQL AES_ENCRYPT / AES_DECRYPT
 */
function mysqlAesKey(key) {
  const keyBuf = Buffer.alloc(16, 0);
  const rawKey = Buffer.from(key, 'utf8');
  for (let i = 0; i < rawKey.length; i++) {
    keyBuf[i % 16] ^= rawKey[i];
  }
  return keyBuf;
}

function mysqlAesEncrypt(text, key) {
  const cipher = crypto.createCipheriv('aes-128-ecb', mysqlAesKey(key), null);
  return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
}

function mysqlAesDecrypt(encryptedBuf, key) {
  const decipher = crypto.createDecipheriv('aes-128-ecb', mysqlAesKey(key), null);
  return Buffer.concat([decipher.update(encryptedBuf), decipher.final()]).toString('utf8');
}

// Dữ liệu mock phòng ban và nhân viên trong bộ nhớ
let mockDepartments = [
  { department_id: 1, department_code: 'PB-TECH', department_name: 'Phòng Kỹ thuật & Công nghệ', is_active: 1 },
  { department_id: 2, department_code: 'PB-HR', department_name: 'Phòng Nhân sự', is_active: 1 },
  { department_id: 99, department_code: 'PB-INACTIVE', department_name: 'Phòng Ngưng Hoạt Động', is_active: 0 },
];

let mockEmployees = [
  {
    employee_id: 1,
    employee_code: 'NV001',
    full_name: 'Đỗ Quang Minh',
    email: 'minh.dq@hrm.local',
    phone: '0901234567',
    address: 'Hà Nội',
    gender: 'Male',
    date_of_birth: '1990-01-01',
    ssn_encrypted: mysqlAesEncrypt('038204001234', env.cccdEncryptionKey),
    ssn_masked: '0382******34',
    ssn_hash: computeCccdHmac('038204001234', env.cccdHmacSecret),
    department_id: 1,
    position: 'Trưởng phòng Kỹ thuật',
    base_salary: 20000000,
    hire_date: '2024-01-15',
    employment_status: 'Active',
    created_at: new Date('2024-01-15'),
    updated_at: new Date('2024-01-15'),
  },
  {
    employee_id: 2,
    employee_code: 'NV002',
    full_name: 'Trần Thị Mai',
    email: 'mai.tt@hrm.local',
    phone: '0902345678',
    address: 'Thái Nguyên',
    gender: 'Female',
    date_of_birth: '1992-05-12',
    ssn_encrypted: mysqlAesEncrypt('038204000002', env.cccdEncryptionKey),
    ssn_masked: '0382******02',
    ssn_hash: computeCccdHmac('038204000002', env.cccdHmacSecret),
    department_id: 2,
    position: 'Trưởng phòng Nhân sự',
    base_salary: 18000000,
    hire_date: '2024-02-01',
    employment_status: 'Active',
    created_at: new Date('2024-02-01'),
    updated_at: new Date('2024-02-01'),
  },
];

// Lưu bản gốc để phục hồi sau test
const origEmployeeFindByCode = employeeRepository.findByCode;
const origEmployeeFindBySsnHash = employeeRepository.findBySsnHash;
const origEmployeeFindByEmail = employeeRepository.findByEmail;
const origEmployeeFindById = employeeRepository.findById;
const origEmployeeGenerateNextCode = employeeRepository.generateNextEmployeeCode;
const origEmployeeCreate = employeeRepository.create;
const origEmployeeDeleteById = employeeRepository.deleteById;
const origDepartmentFindById = departmentRepository.findById;

function setupStubs() {
  departmentRepository.findById = async (id) => {
    const dept = mockDepartments.find((d) => d.department_id === Number(id));
    return dept ? { ...dept } : null;
  };

  employeeRepository.findByCode = async (code) => {
    if (!code || typeof code !== 'string') return null;
    const found = mockEmployees.find((e) => e.employee_code === code.trim().toUpperCase());
    return found ? { ...found } : null;
  };

  employeeRepository.findBySsnHash = async (hash) => {
    if (!hash || typeof hash !== 'string') return null;
    const found = mockEmployees.find((e) => e.ssn_hash === hash.trim().toLowerCase());
    return found ? { ...found } : null;
  };

  employeeRepository.findByEmail = async (email) => {
    if (!email || typeof email !== 'string') return null;
    const found = mockEmployees.find((e) => e.email && e.email.toLowerCase() === email.trim().toLowerCase());
    return found ? { ...found } : null;
  };

  employeeRepository.generateNextEmployeeCode = async () => {
    const maxNum = mockEmployees.reduce((max, e) => {
      const match = e.employee_code.match(/^NV(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);
    return `NV${String(maxNum + 1).padStart(3, '0')}`;
  };

  employeeRepository.create = async (employeeData, cccdEncryptionKey) => {
    if (!cccdEncryptionKey) {
      throw new Error('Khóa mã hóa CCCD_ENCRYPTION_KEY không được để trống khi thực hiện tạo nhân sự.');
    }
    const ssnEncrypted = mysqlAesEncrypt(employeeData.cccdPlain, cccdEncryptionKey);
    const newId = (mockEmployees.reduce((max, e) => Math.max(max, e.employee_id), 0)) + 1;
    const newRecord = {
      employee_id: newId,
      employee_code: employeeData.employeeCode,
      full_name: employeeData.fullName,
      email: employeeData.email || null,
      phone: employeeData.phone || null,
      address: employeeData.address || null,
      gender: employeeData.gender || 'Male',
      date_of_birth: employeeData.dateOfBirth || null,
      ssn_encrypted: ssnEncrypted,
      ssn_masked: employeeData.ssnMasked,
      ssn_hash: employeeData.ssnHash,
      department_id: employeeData.departmentId,
      position: employeeData.position || 'Nhân viên',
      base_salary: employeeData.baseSalary || 0,
      hire_date: employeeData.hireDate,
      employment_status: employeeData.employmentStatus || 'Active',
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockEmployees.push(newRecord);
    return newId;
  };

  employeeRepository.findById = async (id) => {
    const emp = mockEmployees.find((e) => e.employee_id === Number(id));
    if (!emp) return null;
    const dept = mockDepartments.find((d) => d.department_id === emp.department_id);
    return {
      ...emp,
      department_name: dept ? dept.department_name : null,
      department_code: dept ? dept.department_code : null,
    };
  };

  employeeRepository.deleteById = async (id) => {
    const idx = mockEmployees.findIndex((e) => e.employee_id === Number(id));
    if (idx !== -1) {
      mockEmployees.splice(idx, 1);
      return true;
    }
    return false;
  };
}

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

async function startTestSuite() {
  console.log('\n============================================================');
  console.log('👤 BẮT ĐẦU CHẠY BỘ KIỂM THỬ THÊM NHÂN VIÊN & MÃ HÓA CCCD (AES)');
  console.log('============================================================\n');

  setupStubs();

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

      // Tìm trực tiếp bản ghi từ mock database
      const record = mockEmployees.find((e) => e.employee_id === empId);
      assert.ok(record, 'Bản ghi phải được lưu trong CSDL');

      // 11.1 ssn_encrypted phải là Buffer/VARBINARY nhị phân, KHÔNG phải chuỗi rõ
      assert.ok(Buffer.isBuffer(record.ssn_encrypted));
      assert.notStrictEqual(record.ssn_encrypted.toString('utf8'), originalCccd);

      // 11.2 AES_DECRYPT với đúng khóa phải trả về số CCCD ban đầu
      const decrypted = mysqlAesDecrypt(record.ssn_encrypted, env.cccdEncryptionKey);
      assert.strictEqual(decrypted, originalCccd);

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
      const countBefore = mockEmployees.length;

      const { req, res, next } = createMockHttp({
        body: {
          fullName: 'Nhân Viên Hỏng',
          cccd: '123', // Sai độ dài -> Lỗi
          departmentId: 1,
        },
      });

      await createEmployee(req, res, next);
      assert.strictEqual(res.statusCode, 400);

      const countAfter = mockEmployees.length;

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

      assert.ok(emp.employeeCode);
      assert.ok(/^NV\d+$/.test(emp.employeeCode));
    });

  } finally {
    // Khôi phục stub
    employeeRepository.findByCode = origEmployeeFindByCode;
    employeeRepository.findBySsnHash = origEmployeeFindBySsnHash;
    employeeRepository.findByEmail = origEmployeeFindByEmail;
    employeeRepository.findById = origEmployeeFindById;
    employeeRepository.generateNextEmployeeCode = origEmployeeGenerateNextCode;
    employeeRepository.create = origEmployeeCreate;
    employeeRepository.deleteById = origEmployeeDeleteById;
    departmentRepository.findById = origDepartmentFindById;
  }

  console.log('\n============================================================');
  console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ THÊM NHÂN VIÊN & MÃ HÓA CCCD!`);
  console.log('============================================================\n');

  process.exit(0);
}

startTestSuite().catch((err) => {
  console.error('Lỗi khi chạy bộ kiểm thử employee:', err);
  process.exit(1);
});
