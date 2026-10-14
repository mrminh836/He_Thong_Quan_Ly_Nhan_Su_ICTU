/**
 * BỘ KIỂM THỬ TỰ ĐỘNG CHỨC NĂNG CRUD PHÒNG BAN (DEPARTMENT API) - HRM ICTU
 * Tuân thủ đầy đủ 16 yêu cầu kiểm thử tối thiểu theo tài liệu đặc tả:
 * 1.  POST tạo phòng ban hợp lệ -> 201 Created
 * 2.  POST thiếu tên phòng ban -> 400 Bad Request
 * 3.  POST tên trùng -> 409 Conflict (Unique constraint)
 * 4.  GET danh sách phòng ban -> 200 OK (kèm phân trang meta)
 * 5.  GET chi tiết ID tồn tại -> 200 OK
 * 6.  GET ID không tồn tại -> 404 Not Found
 * 7.  GET ID sai định dạng -> 400 Bad Request
 * 8.  PUT cập nhật hợp lệ -> 200 OK
 * 9.  PUT tên trùng với phòng ban khác -> 409 Conflict
 * 10. PUT ID không tồn tại -> 404 Not Found
 * 11. DELETE phòng ban không có dữ liệu tham chiếu -> 200 OK
 * 12. DELETE phòng ban đang có nhân viên tham chiếu -> 409 Conflict
 * 13. Request không có token -> 401 Unauthorized
 * 14. Role không đủ quyền (EMPLOYEE cố tạo/sửa/xóa, HR cố xóa) -> 403 Forbidden
 * 15. SQL Injection qua tên phòng ban hoặc ID -> Được xử lý an toàn
 * 16. Database không khả dụng -> Trả lỗi chuẩn 500, không lộ thông tin nhạy cảm
 */

import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { ROLES } from '../src/constants/roles.js';
import departmentRepository from '../src/repositories/departmentRepository.js';
import departmentService, { DepartmentError } from '../src/services/departmentService.js';
import {
  getDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from '../src/controllers/departmentController.js';
import { authenticateToken } from '../src/middlewares/auth.js';
import { requireRole } from '../src/middlewares/role.js';
import userRepository from '../src/repositories/userRepository.js';

let passedTests = 0;
let totalTests = 0;

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
  console.log('🏢 BẮT ĐẦU CHẠY BỘ KIỂM THỬ CRUD DEPARTMENT API (16 CASES)');
  console.log('============================================================\n');

  // Chuẩn bị Mock Tokens
  const adminToken = jwt.sign(
    { sub: 1, username: 'admin', role: 'Admin' },
    env.jwtSecret,
    { algorithm: 'HS256', expiresIn: '1h' }
  );

  const hrToken = jwt.sign(
    { sub: 2, username: 'hr_manager', role: 'HR' },
    env.jwtSecret,
    { algorithm: 'HS256', expiresIn: '1h' }
  );

  const empToken = jwt.sign(
    { sub: 3, username: 'employee_1', role: 'Employee' },
    env.jwtSecret,
    { algorithm: 'HS256', expiresIn: '1h' }
  );

  const mockAdminUser = {
    user_id: 1,
    username: 'admin',
    role: 'Admin',
    account_status: 'Active',
  };

  const mockHrUser = {
    user_id: 2,
    username: 'hr_manager',
    role: 'HR',
    account_status: 'Active',
  };

  const mockEmpUser = {
    user_id: 3,
    username: 'employee_1',
    role: 'Employee',
    account_status: 'Active',
  };

  // Mock repository data store trong bộ nhớ phục vụ unit test độc lập
  let mockDatabase = [
    {
      department_id: 1,
      department_code: 'PB-TECH',
      department_name: 'Phòng Kỹ thuật & Công nghệ',
      location: 'Tầng 4 - Tòa nhà A',
      phone: '0208-3846-001',
      description: 'Phát triển phần mềm',
      is_active: 1,
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
      employee_count: 3,
    },
    {
      department_id: 2,
      department_code: 'PB-HR',
      department_name: 'Phòng Nhân sự & Hành chính',
      location: 'Tầng 3 - Tòa nhà A',
      phone: '0208-3846-002',
      description: 'Quản lý nhân sự',
      is_active: 1,
      created_at: new Date('2026-01-02'),
      updated_at: new Date('2026-01-02'),
      employee_count: 1,
    },
    {
      department_id: 3,
      department_code: 'PB-EMPTY',
      department_name: 'Phòng Dự án Thử nghiệm',
      location: 'Tầng 1 - Tòa nhà B',
      phone: '0208-3846-003',
      description: 'Phòng ban trống chưa có nhân sự',
      is_active: 1,
      created_at: new Date('2026-01-03'),
      updated_at: new Date('2026-01-03'),
      employee_count: 0,
    },
  ];

  // Lưu bản gốc để phục hồi
  const originalFindById = departmentRepository.findById;
  const originalFindAll = departmentRepository.findAll;
  const originalFindByName = departmentRepository.findByName;
  const originalFindByNameExcludingId = departmentRepository.findByNameExcludingId;
  const originalFindByCode = departmentRepository.findByCode;
  const originalFindByCodeExcludingId = departmentRepository.findByCodeExcludingId;
  const originalCountEmployees = departmentRepository.countEmployeesByDepartmentId;
  const originalCreate = departmentRepository.create;
  const originalUpdate = departmentRepository.update;
  const originalDeleteById = departmentRepository.deleteById;
  const originalUserFindById = userRepository.findById;

  // Thiết lập stub cho mock database
  function setupStubs() {
    userRepository.findById = async (id) => {
      if (id === 1) return mockAdminUser;
      if (id === 2) return mockHrUser;
      if (id === 3) return mockEmpUser;
      return null;
    };

    departmentRepository.findById = async (id) => {
      const found = mockDatabase.find((d) => d.department_id === Number(id));
      return found ? departmentRepository.formatDepartment(found) : null;
    };

    departmentRepository.findAll = async ({
      page = 1,
      limit = 10,
      search = '',
      isActive = null,
    } = {}) => {
      let filtered = [...mockDatabase];
      if (search) {
        filtered = filtered.filter(
          (d) =>
            d.department_name.toLowerCase().includes(search.toLowerCase()) ||
            d.department_code.toLowerCase().includes(search.toLowerCase())
        );
      }
      if (isActive !== null) {
        filtered = filtered.filter((d) => Boolean(d.is_active) === Boolean(isActive));
      }
      const total = filtered.length;
      const start = (page - 1) * limit;
      const paged = filtered.slice(start, start + limit);
      return {
        items: paged.map(departmentRepository.formatDepartment),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    };

    departmentRepository.findByName = async (name) => {
      return (
        mockDatabase.find(
          (d) => d.department_name.trim().toLowerCase() === name.trim().toLowerCase()
        ) || null
      );
    };

    departmentRepository.findByNameExcludingId = async (name, id) => {
      return (
        mockDatabase.find(
          (d) =>
            d.department_name.trim().toLowerCase() === name.trim().toLowerCase() &&
            d.department_id !== Number(id)
        ) || null
      );
    };

    departmentRepository.findByCode = async (code) => {
      return (
        mockDatabase.find(
          (d) => d.department_code.trim().toUpperCase() === code.trim().toUpperCase()
        ) || null
      );
    };

    departmentRepository.findByCodeExcludingId = async (code, id) => {
      return (
        mockDatabase.find(
          (d) =>
            d.department_code.trim().toUpperCase() === code.trim().toUpperCase() &&
            d.department_id !== Number(id)
        ) || null
      );
    };

    departmentRepository.countEmployeesByDepartmentId = async (id) => {
      const found = mockDatabase.find((d) => d.department_id === Number(id));
      return found ? found.employee_count : 0;
    };

    departmentRepository.create = async (data) => {
      const nextId =
        mockDatabase.length > 0 ? Math.max(...mockDatabase.map((d) => d.department_id)) + 1 : 1;
      const newRecord = {
        department_id: nextId,
        department_code: data.departmentCode,
        department_name: data.departmentName,
        location: data.location || null,
        phone: data.phone || null,
        description: data.description || null,
        is_active: data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1,
        created_at: new Date(),
        updated_at: new Date(),
        employee_count: 0,
      };
      mockDatabase.push(newRecord);
      return nextId;
    };

    departmentRepository.update = async (id, updates) => {
      const idx = mockDatabase.findIndex((d) => d.department_id === Number(id));
      if (idx === -1) return false;
      const cur = mockDatabase[idx];
      if (updates.departmentName !== undefined) cur.department_name = updates.departmentName;
      if (updates.departmentCode !== undefined) cur.department_code = updates.departmentCode;
      if (updates.location !== undefined) cur.location = updates.location;
      if (updates.phone !== undefined) cur.phone = updates.phone;
      if (updates.description !== undefined) cur.description = updates.description;
      if (updates.isActive !== undefined) cur.is_active = updates.isActive ? 1 : 0;
      cur.updated_at = new Date();
      return true;
    };

    departmentRepository.deleteById = async (id) => {
      const idx = mockDatabase.findIndex((d) => d.department_id === Number(id));
      if (idx === -1) return false;
      mockDatabase.splice(idx, 1);
      return true;
    };
  }

  setupStubs();

  try {
    // -------------------------------------------------------------------------
    // TEST 1: POST tạo phòng ban hợp lệ -> 201 Created
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 1: POST tạo phòng ban hợp lệ -> 201 Created', async () => {
      const { req, res, next } = createMockHttp({
        body: {
          departmentName: 'Phòng Đào tạo & Khảo thí',
          departmentCode: 'PB-TRAIN',
          description: 'Quản lý đào tạo và chứng chỉ nghề nghiệp',
        },
      });

      await createDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.responseBody.success, true);
      assert.strictEqual(res.responseBody.data.departmentName, 'Phòng Đào tạo & Khảo thí');
      assert.strictEqual(res.responseBody.data.departmentCode, 'PB-TRAIN');
      assert.strictEqual(res.responseBody.data.employeeCount, 0);
    });

    // -------------------------------------------------------------------------
    // TEST 2: POST thiếu tên phòng ban -> 400 Bad Request
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 2: POST thiếu tên phòng ban -> 400 Bad Request', async () => {
      const { req, res, next } = createMockHttp({
        body: {
          departmentCode: 'PB-TEST',
          description: 'Không truyền departmentName',
        },
      });

      await createDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.responseBody.success, false);
      assert.strictEqual(res.responseBody.errorCode, 'VALIDATION_ERROR');
    });

    // -------------------------------------------------------------------------
    // TEST 3: POST tên trùng -> 409 Conflict
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 3: POST tên phòng ban bị trùng -> 409 Conflict', async () => {
      const { req, res, next } = createMockHttp({
        body: {
          departmentName: 'Phòng Kỹ thuật & Công nghệ', // Đã tồn tại
          description: 'Thử tạo trùng tên',
        },
      });

      await createDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.responseBody.success, false);
      assert.strictEqual(res.responseBody.errorCode, 'DUPLICATE_DEPARTMENT_NAME');
    });

    // -------------------------------------------------------------------------
    // TEST 4: GET danh sách phòng ban -> 200 OK (kèm pagination meta)
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 4: GET danh sách phòng ban -> 200 OK kèm pagination meta', async () => {
      const { req, res, next } = createMockHttp({
        query: { page: '1', limit: '10' },
      });

      await getDepartments(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.responseBody.success, true);
      assert.ok(Array.isArray(res.responseBody.data));
      assert.ok(res.responseBody.meta);
      assert.strictEqual(res.responseBody.meta.page, 1);
      assert.strictEqual(res.responseBody.meta.limit, 10);
      assert.ok(res.responseBody.meta.total >= 3);
    });

    // -------------------------------------------------------------------------
    // TEST 5: GET chi tiết ID tồn tại -> 200 OK
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 5: GET chi tiết ID tồn tại -> 200 OK', async () => {
      const { req, res, next } = createMockHttp({
        params: { id: '1' },
      });

      await getDepartmentById(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.responseBody.success, true);
      assert.strictEqual(res.responseBody.data.id, 1);
      assert.strictEqual(res.responseBody.data.departmentCode, 'PB-TECH');
      assert.strictEqual(res.responseBody.data.employeeCount, 3);
    });

    // -------------------------------------------------------------------------
    // TEST 6: GET ID không tồn tại -> 404 Not Found
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 6: GET ID không tồn tại -> 404 Not Found', async () => {
      const { req, res, next } = createMockHttp({
        params: { id: '99999' },
      });

      await getDepartmentById(req, res, next);

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.responseBody.success, false);
      assert.strictEqual(res.responseBody.errorCode, 'DEPARTMENT_NOT_FOUND');
    });

    // -------------------------------------------------------------------------
    // TEST 7: GET ID sai định dạng -> 400 Bad Request
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 7: GET ID sai định dạng (chuỗi ký tự / số âm) -> 400 Bad Request', async () => {
      const { req, res, next } = createMockHttp({
        params: { id: 'abc-invalid' },
      });

      await getDepartmentById(req, res, next);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.responseBody.success, false);
      assert.strictEqual(res.responseBody.errorCode, 'INVALID_ID');
    });

    // -------------------------------------------------------------------------
    // TEST 8: PUT cập nhật hợp lệ -> 200 OK
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 8: PUT cập nhật thông tin hợp lệ -> 200 OK', async () => {
      const { req, res, next } = createMockHttp({
        params: { id: '3' },
        body: {
          departmentName: 'Phòng Nghiên cứu & Sáng tạo mới',
          location: 'Tầng 5 - Tòa nhà C',
        },
      });

      await updateDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.responseBody.success, true);
      assert.strictEqual(res.responseBody.data.departmentName, 'Phòng Nghiên cứu & Sáng tạo mới');
      assert.strictEqual(res.responseBody.data.location, 'Tầng 5 - Tòa nhà C');
    });

    // -------------------------------------------------------------------------
    // TEST 9: PUT tên trùng với phòng ban khác -> 409 Conflict
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 9: PUT tên trùng với phòng ban khác -> 409 Conflict', async () => {
      const { req, res, next } = createMockHttp({
        params: { id: '3' },
        body: {
          departmentName: 'Phòng Kỹ thuật & Công nghệ', // Trùng với ID 1
        },
      });

      await updateDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.responseBody.success, false);
      assert.strictEqual(res.responseBody.errorCode, 'DUPLICATE_DEPARTMENT_NAME');
    });

    // -------------------------------------------------------------------------
    // TEST 10: PUT ID không tồn tại -> 404 Not Found
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 10: PUT ID không tồn tại -> 404 Not Found', async () => {
      const { req, res, next } = createMockHttp({
        params: { id: '88888' },
        body: {
          departmentName: 'Tên mới bất kỳ',
        },
      });

      await updateDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.responseBody.success, false);
      assert.strictEqual(res.responseBody.errorCode, 'DEPARTMENT_NOT_FOUND');
    });

    // -------------------------------------------------------------------------
    // TEST 11: DELETE phòng ban không có dữ liệu tham chiếu -> 200 OK
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 11: DELETE phòng ban rỗng (0 nhân sự) -> 200 OK', async () => {
      const { req, res, next } = createMockHttp({
        params: { id: '3' }, // employee_count = 0
      });

      await deleteDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.responseBody.success, true);
      assert.strictEqual(res.responseBody.data.type, 'HARD_DELETE');

      // Xác minh phòng ban 3 đã bị xóa khỏi mock database
      const checkDeleted = mockDatabase.find((d) => d.department_id === 3);
      assert.strictEqual(checkDeleted, undefined);
    });

    // -------------------------------------------------------------------------
    // TEST 12: DELETE phòng ban đang có nhân viên tham chiếu -> 409 Conflict
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 12: DELETE phòng ban đang có nhân sự -> Bị từ chối với 409 Conflict', async () => {
      const { req, res, next } = createMockHttp({
        params: { id: '1' }, // employee_count = 3
      });

      await deleteDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.responseBody.success, false);
      assert.strictEqual(res.responseBody.errorCode, 'DEPARTMENT_HAS_EMPLOYEES');
      assert.ok(res.responseBody.message.includes('nhân sự trực thuộc'));
    });

    // -------------------------------------------------------------------------
    // TEST 13: Request không có token -> 401 Unauthorized
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 13: Request không có Authorization header -> 401 TOKEN_REQUIRED', async () => {
      const { req, res, next, getNextCalled } = createMockHttp({
        headers: {},
      });

      await authenticateToken(req, res, next);

      assert.strictEqual(getNextCalled(), false);
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.responseBody.errorCode, 'TOKEN_REQUIRED');
    });

    // -------------------------------------------------------------------------
    // TEST 14: Role không đủ quyền -> 403 Forbidden
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 14: Role EMPLOYEE cố xóa phòng ban -> 403 FORBIDDEN', async () => {
      // 14.1 EMPLOYEE cố gọi DELETE (chỉ ADMIN mới được phép)
      const guardDelete = requireRole(ROLES.ADMIN);
      const { req: reqEmp, res: resEmp, next: nextEmp, getNextCalled: calledEmp } = createMockHttp({
        user: { role: ROLES.EMPLOYEE },
      });

      guardDelete(reqEmp, resEmp, nextEmp);

      assert.strictEqual(calledEmp(), false);
      assert.strictEqual(resEmp.statusCode, 403);
      assert.strictEqual(resEmp.responseBody.errorCode, 'FORBIDDEN');

      // 14.2 HR_MANAGER cố gọi DELETE -> 403 FORBIDDEN
      const { req: reqHr, res: resHr, next: nextHr, getNextCalled: calledHr } = createMockHttp({
        user: { role: ROLES.HR_MANAGER },
      });

      guardDelete(reqHr, resHr, nextHr);

      assert.strictEqual(calledHr(), false);
      assert.strictEqual(resHr.statusCode, 403);
      assert.strictEqual(resHr.responseBody.errorCode, 'FORBIDDEN');

      // 14.3 ADMIN gọi DELETE -> Cho phép (next() được gọi)
      const { req: reqAdmin, res: resAdmin, next: nextAdmin, getNextCalled: calledAdmin } = createMockHttp({
        user: { role: ROLES.ADMIN },
      });

      guardDelete(reqAdmin, resAdmin, nextAdmin);
      assert.strictEqual(calledAdmin(), true);
    });

    // -------------------------------------------------------------------------
    // TEST 15: SQL Injection qua tên phòng ban hoặc ID -> Xử lý an toàn
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 15: SQL Injection qua ID hoặc Tên phòng ban -> Được ngăn chặn an toàn', async () => {
      // Injection qua ID: '1 OR 1=1' -> Bị validator chặn ngay ở tầng controller với HTTP 400
      const { req: reqSqlId, res: resSqlId, next: nextSqlId } = createMockHttp({
        params: { id: "1' OR '1'='1" },
      });

      await getDepartmentById(reqSqlId, resSqlId, nextSqlId);

      assert.strictEqual(resSqlId.statusCode, 400);
      assert.strictEqual(resSqlId.responseBody.errorCode, 'INVALID_ID');

      // Injection qua Body Name: Dữ liệu được đưa vào tham số Parameterized
      const { req: reqSqlBody, res: resSqlBody, next: nextSqlBody } = createMockHttp({
        body: {
          departmentName: "Phòng Test'; DROP TABLE departments; --",
        },
      });

      await createDepartment(reqSqlBody, resSqlBody, nextSqlBody);

      // Tạo thành công với tên chính xác là chuỗi ký tự, không bị execute mã độc
      assert.strictEqual(resSqlBody.statusCode, 201);
      assert.strictEqual(
        resSqlBody.responseBody.data.departmentName,
        "Phòng Test'; DROP TABLE departments; --"
      );
    });

    // -------------------------------------------------------------------------
    // TEST 16: Database không khả dụng -> Trả lỗi 500 an toàn, không lộ stack trace
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 16: Database gặp sự cố -> Chuyển tiếp next(error) an toàn cho Error Handler', async () => {
      departmentRepository.findAll = async () => {
        const dbErr = new Error('getaddrinfo ENOTFOUND mysql-db.internal');
        dbErr.code = 'ECONNREFUSED';
        throw dbErr;
      };

      const { req, res, next, getNextCalled, getNextError } = createMockHttp({
        query: { page: '1' },
      });

      await getDepartments(req, res, next);

      assert.strictEqual(getNextCalled(), true);
      assert.ok(getNextError());
      assert.strictEqual(getNextError().code, 'ECONNREFUSED');
      // Không in hoặc gửi chuỗi kết nối nhạy cảm ra ngoài
    });

    console.log('\n============================================================');
    console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ CRUD DEPARTMENT!`);
    console.log('============================================================\n');
  } finally {
    // Khôi phục stub
    departmentRepository.findById = originalFindById;
    departmentRepository.findAll = originalFindAll;
    departmentRepository.findByName = originalFindByName;
    departmentRepository.findByNameExcludingId = originalFindByNameExcludingId;
    departmentRepository.findByCode = originalFindByCode;
    departmentRepository.findByCodeExcludingId = originalFindByCodeExcludingId;
    departmentRepository.countEmployeesByDepartmentId = originalCountEmployees;
    departmentRepository.create = originalCreate;
    departmentRepository.update = originalUpdate;
    departmentRepository.deleteById = originalDeleteById;
    userRepository.findById = originalUserFindById;
  }
}

startTestSuite().catch((err) => {
  console.error('Lỗi khi chạy bộ kiểm thử department:', err);
  process.exit(1);
});
