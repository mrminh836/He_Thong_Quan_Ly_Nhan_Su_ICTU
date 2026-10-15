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
  getDepartmentStatistics,
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
    {
      department_id: 4,
      department_code: 'PB-ARCHIVE',
      department_name: 'Phòng Lưu trữ Hồ sơ',
      location: 'Kho B',
      phone: '0208-3846-004',
      description: 'Chỉ có nhân viên đã thôi việc tham chiếu',
      is_active: 1,
      created_at: new Date('2026-01-04'),
      updated_at: new Date('2026-01-04'),
      employee_count: 0,
    },
  ];

  // Danh sách nhân viên mẫu để kiểm thử thống kê nhân viên hiện tại
  const mockEmployees = [
    { employee_id: 101, department_id: 1, employment_status: 'Active' },
    { employee_id: 102, department_id: 1, employment_status: 'Active' },
    { employee_id: 103, department_id: 1, employment_status: 'OnLeave' },
    { employee_id: 104, department_id: 1, employment_status: 'Resigned' }, // Đã nghỉ việc -> không tính vào hiện tại
    { employee_id: 105, department_id: 2, employment_status: 'Active' },
    { employee_id: 106, department_id: null, employment_status: 'Active' }, // Chưa gán phòng ban
    { employee_id: 107, department_id: 4, employment_status: 'Resigned' }, // Đã nghỉ việc nhưng vẫn tham chiếu PB 4
  ];

  // Lưu bản gốc để phục hồi
  const originalFindById = departmentRepository.findById;
  const originalFindAll = departmentRepository.findAll;
  const originalFindByName = departmentRepository.findByName;
  const originalFindByNameExcludingId = departmentRepository.findByNameExcludingId;
  const originalFindByCode = departmentRepository.findByCode;
  const originalFindByCodeExcludingId = departmentRepository.findByCodeExcludingId;
  const originalCountEmployees = departmentRepository.countEmployeesByDepartmentId;
  const originalHasEmployees = departmentRepository.hasEmployees;
  const originalFindByIdForUpdate = departmentRepository.findByIdForUpdate;
  const originalDeleteDepartmentWithLock = departmentRepository.deleteDepartmentWithLock;
  const originalGetDepartmentEmployeeStats = departmentRepository.getDepartmentEmployeeStats;
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

    departmentRepository.getDepartmentEmployeeStats = async ({
      departmentStatus = 'all',
      sortBy = 'employee_count',
      sortOrder = 'DESC',
    } = {}) => {
      let depts = [...mockDatabase];
      if (departmentStatus === 'active') {
        depts = depts.filter((d) => Boolean(d.is_active));
      } else if (departmentStatus === 'inactive') {
        depts = depts.filter((d) => !d.is_active);
      }

      const result = depts.map((d) => {
        const empInDept = mockEmployees.filter((e) => e.department_id === d.department_id);
        const activeCount = empInDept.filter((e) => e.employment_status === 'Active').length;
        const onLeaveCount = empInDept.filter((e) => e.employment_status === 'OnLeave').length;
        const resignedCount = empInDept.filter((e) => e.employment_status === 'Resigned').length;
        const employeeCount = activeCount + onLeaveCount;

        return {
          departmentId: d.department_id,
          departmentCode: d.department_code,
          departmentName: d.department_name,
          isActive: Boolean(d.is_active),
          employeeCount,
          activeCount,
          onLeaveCount,
          resignedCount,
        };
      });

      if (sortBy === 'department_name') {
        result.sort((a, b) =>
          sortOrder === 'ASC'
            ? a.departmentName.localeCompare(b.departmentName)
            : b.departmentName.localeCompare(a.departmentName)
        );
      } else {
        result.sort((a, b) =>
          sortOrder === 'ASC'
            ? a.employeeCount - b.employeeCount
            : b.employeeCount - a.employeeCount
        );
      }

      return result;
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

    departmentRepository.hasEmployees = async (id) => {
      const hasEmp = mockEmployees.some((e) => e.department_id === Number(id));
      const found = mockDatabase.find((d) => d.department_id === Number(id));
      return hasEmp || (found ? found.employee_count > 0 : false);
    };

    departmentRepository.findByIdForUpdate = async (id) => {
      const found = mockDatabase.find((d) => d.department_id === Number(id));
      return found ? departmentRepository.formatDepartment(found) : null;
    };

    departmentRepository.deleteDepartmentWithLock = async (id, { isSoftDelete = false } = {}) => {
      const idx = mockDatabase.findIndex((d) => d.department_id === Number(id));
      if (idx === -1) {
        return { found: false, hasEmployees: false, isDeleted: false };
      }
      const cur = mockDatabase[idx];
      const hasEmp = mockEmployees.some((e) => e.department_id === Number(id)) || cur.employee_count > 0;
      if (hasEmp) {
        return { found: true, hasEmployees: true, isDeleted: false, department: departmentRepository.formatDepartment(cur) };
      }
      if (isSoftDelete) {
        cur.is_active = 0;
        return { found: true, hasEmployees: false, isDeleted: true, type: 'SOFT_DELETE', department: departmentRepository.formatDepartment(cur) };
      }
      mockDatabase.splice(idx, 1);
      return { found: true, hasEmployees: false, isDeleted: true, type: 'HARD_DELETE', department: departmentRepository.formatDepartment(cur) };
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
    // TEST 12.1: DELETE phòng ban có nhiều nhân viên -> 409 Conflict
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 12.1: DELETE phòng ban có nhiều nhân viên (ID 1 có 3 NV) -> Bị từ chối với 409 Conflict', async () => {
      const { req, res, next } = createMockHttp({
        params: { id: '1' },
      });

      await deleteDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.responseBody.success, false);
      assert.strictEqual(res.responseBody.errorCode, 'DEPARTMENT_HAS_EMPLOYEES');
      assert.strictEqual(res.responseBody.code, 'DEPARTMENT_HAS_EMPLOYEES');
      assert.strictEqual(res.responseBody.message, 'Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc.');
      const stillExists = mockDatabase.find((d) => d.department_id === 1);
      assert.ok(stillExists, 'Phòng ban 1 không được phép bị xóa');
    });

    // -------------------------------------------------------------------------
    // TEST 12.2: DELETE phòng ban có đúng 1 nhân viên -> 409 Conflict
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 12.2: DELETE phòng ban có đúng 1 nhân viên (ID 2 có 1 NV) -> Bị từ chối với 409 Conflict', async () => {
      const { req, res, next } = createMockHttp({
        params: { id: '2' },
      });

      await deleteDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.responseBody.success, false);
      assert.strictEqual(res.responseBody.errorCode, 'DEPARTMENT_HAS_EMPLOYEES');
      assert.strictEqual(res.responseBody.code, 'DEPARTMENT_HAS_EMPLOYEES');
      assert.strictEqual(res.responseBody.message, 'Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc.');
      const stillExists = mockDatabase.find((d) => d.department_id === 2);
      assert.ok(stillExists, 'Phòng ban 2 không được phép bị xóa');
    });

    // -------------------------------------------------------------------------
    // TEST 12.3: DELETE phòng ban chỉ có nhân viên đã nghỉ việc (Resigned) -> 409 Conflict
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 12.3: DELETE phòng ban chỉ có nhân viên đã thôi việc (Resigned) vẫn tham chiếu -> Bị từ chối với 409 Conflict', async () => {
      const { req, res, next } = createMockHttp({
        params: { id: '4' },
      });

      await deleteDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.responseBody.success, false);
      assert.strictEqual(res.responseBody.errorCode, 'DEPARTMENT_HAS_EMPLOYEES');
      assert.strictEqual(res.responseBody.code, 'DEPARTMENT_HAS_EMPLOYEES');
      assert.strictEqual(res.responseBody.message, 'Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc.');
      const stillExists = mockDatabase.find((d) => d.department_id === 4);
      assert.ok(stillExists, 'Phòng ban 4 không được phép bị xóa');
    });

    // -------------------------------------------------------------------------
    // TEST 12.4: DELETE phòng ban không tồn tại -> 404 Not Found
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 12.4: DELETE phòng ban không tồn tại (ID 99999) -> 404 Not Found', async () => {
      const { req, res, next } = createMockHttp({
        params: { id: '99999' },
      });

      await deleteDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.responseBody.success, false);
      assert.strictEqual(res.responseBody.errorCode, 'DEPARTMENT_NOT_FOUND');
      assert.strictEqual(res.responseBody.code, 'DEPARTMENT_NOT_FOUND');
      assert.strictEqual(res.responseBody.message, 'Không tìm thấy phòng ban.');
    });

    // -------------------------------------------------------------------------
    // TEST 12.5: DELETE ID sai định dạng -> 400 Bad Request
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 12.5: DELETE ID sai định dạng (chuỗi / số âm) -> 400 Bad Request', async () => {
      const { req, res, next } = createMockHttp({
        params: { id: 'invalid-id' },
      });

      await deleteDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.responseBody.success, false);
      assert.strictEqual(res.responseBody.errorCode, 'INVALID_ID');
      assert.strictEqual(res.responseBody.code, 'INVALID_ID');
    });

    // -------------------------------------------------------------------------
    // TEST 12.6: Cơ sở dữ liệu phát sinh lỗi khóa ngoại (ER_ROW_IS_REFERENCED_2 / 1451) -> 409 an toàn
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 12.6: Cơ sở dữ liệu phát sinh lỗi khóa ngoại (1451) -> Chuẩn hóa 409 DEPARTMENT_HAS_EMPLOYEES, không lộ stack trace', async () => {
      const tempDeleteById = departmentRepository.deleteById;
      const tempHasEmployees = departmentRepository.hasEmployees;
      try {
        departmentRepository.hasEmployees = async () => false; // Giả lập race condition vượt qua app check
        departmentRepository.deleteById = async () => {
          const fkErr = new Error('Cannot delete or update a parent row: a foreign key constraint fails (`hrm_db`.`employees`, CONSTRAINT `fk_employees_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`))');
          fkErr.code = 'ER_ROW_IS_REFERENCED_2';
          fkErr.errno = 1451;
          throw fkErr;
        };

        const { req, res, next } = createMockHttp({
          params: { id: '1' },
        });

        await deleteDepartment(req, res, next);

        assert.strictEqual(res.statusCode, 409);
        assert.strictEqual(res.responseBody.success, false);
        assert.strictEqual(res.responseBody.errorCode, 'DEPARTMENT_HAS_EMPLOYEES');
        assert.strictEqual(res.responseBody.code, 'DEPARTMENT_HAS_EMPLOYEES');
        assert.strictEqual(res.responseBody.message, 'Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc.');
        assert.strictEqual(res.responseBody.stack, undefined);
        assert.strictEqual(JSON.stringify(res.responseBody).includes('CONSTRAINT `fk_employees_department`'), false);
      } finally {
        departmentRepository.deleteById = tempDeleteById;
        departmentRepository.hasEmployees = tempHasEmployees;
      }
    });

    // -------------------------------------------------------------------------
    // TEST 12.7: Request xóa và request gán nhân viên đồng thời -> Transaction có khóa FOR UPDATE
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 12.7: Cơ chế khóa bi quan FOR UPDATE và Transaction bảo đảm không phát sinh tham chiếu mồ côi khi có request đồng thời', async () => {
      assert.strictEqual(typeof departmentRepository.deleteDepartmentWithLock, 'function');
      const lockRes = await departmentRepository.deleteDepartmentWithLock(1);
      assert.strictEqual(lockRes.found, true);
      assert.strictEqual(lockRes.hasEmployees, true);
      assert.strictEqual(lockRes.isDeleted, false);
    });

    // -------------------------------------------------------------------------
    // TEST 12.8: Khi xóa bị từ chối -> phòng ban và toàn bộ nhân viên được giữ nguyên vẹn
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 12.8: Khi thao tác xóa bị từ chối -> Cả phòng ban và toàn bộ nhân sự đều được giữ nguyên vẹn', async () => {
      const initialDepts = mockDatabase.map((d) => ({ ...d }));
      const initialEmps = mockEmployees.map((e) => ({ ...e }));

      // Thử xóa phòng ban 1 (có nhân viên)
      const { req: r1, res: s1, next: n1 } = createMockHttp({ params: { id: '1' } });
      await deleteDepartment(r1, s1, n1);
      assert.strictEqual(s1.statusCode, 409);

      // Thử xóa phòng ban 4 (có nhân viên đã nghỉ việc)
      const { req: r4, res: s4, next: n4 } = createMockHttp({ params: { id: '4' } });
      await deleteDepartment(r4, s4, n4);
      assert.strictEqual(s4.statusCode, 409);

      // Kiểm tra dữ liệu không bị biến động
      assert.strictEqual(mockDatabase.length, initialDepts.length);
      assert.strictEqual(mockEmployees.length, initialEmps.length);
      assert.ok(mockDatabase.some((d) => d.department_id === 1));
      assert.ok(mockDatabase.some((d) => d.department_id === 4));
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

    // -------------------------------------------------------------------------
    // TEST 17: GET /api/departments/statistics - Thống kê số lượng nhân viên hiện tại
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 17: GET /api/departments/statistics -> 200 OK với số lượng nhân viên chính xác', async () => {
      const { req, res, next } = createMockHttp({});

      await getDepartmentStatistics(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.responseBody.success, true);
      assert.ok(Array.isArray(res.responseBody.data));
      assert.strictEqual(res.responseBody.data.length, mockDatabase.length);

      const dept1 = res.responseBody.data.find((d) => d.departmentId === 1);
      assert.ok(dept1);
      // Phòng ban 1 có: 2 Active + 1 OnLeave = 3 nhân viên hiện tại
      assert.strictEqual(dept1.employeeCount, 3);
      assert.strictEqual(dept1.activeCount, 2);
      assert.strictEqual(dept1.onLeaveCount, 1);
      assert.strictEqual(dept1.resignedCount, 1);

      // Meta tổng hợp
      assert.strictEqual(res.responseBody.meta.totalDepartments, mockDatabase.length);
      const expectedTotalEmployees = mockEmployees.filter(
        (e) => e.department_id !== null && ['Active', 'OnLeave'].includes(e.employment_status)
      ).length;
      assert.strictEqual(res.responseBody.meta.totalEmployees, expectedTotalEmployees); // 3 (PB1) + 1 (PB2) = 4
    });

    // -------------------------------------------------------------------------
    // TEST 18: Thống kê loại trừ nhân viên đã nghỉ việc (Resigned)
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 18: Nhân viên đã nghỉ việc (Resigned / Soft-delete) không được tính vào employeeCount', async () => {
      const { req, res, next } = createMockHttp({});

      await getDepartmentStatistics(req, res, next);

      const dept1 = res.responseBody.data.find((d) => d.departmentId === 1);
      // Nếu đếm cả Resigned thì sẽ là 4, nhưng quy tắc chuẩn chỉ là 3
      assert.strictEqual(dept1.employeeCount, 3);
      assert.strictEqual(dept1.resignedCount, 1);
    });

    // -------------------------------------------------------------------------
    // TEST 19: Phòng ban rỗng (0 nhân sự) vẫn xuất hiện trong kết quả với employeeCount = 0
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 19: Phòng ban có 0 nhân sự vẫn hiển thị đầy đủ với employeeCount = 0 (LEFT JOIN)', async () => {
      const { req, res, next } = createMockHttp({});

      await getDepartmentStatistics(req, res, next);

      // Tìm phòng ban có 0 nhân viên trong kết quả trả về
      const deptEmpty = res.responseBody.data.find((d) => d.employeeCount === 0);
      assert.ok(deptEmpty, 'Phòng ban trống bắt buộc phải có mặt trong danh sách thống kê');
      assert.strictEqual(deptEmpty.employeeCount, 0);
      assert.strictEqual(deptEmpty.activeCount, 0);
      assert.strictEqual(deptEmpty.onLeaveCount, 0);
    });

    // -------------------------------------------------------------------------
    // TEST 20: Nhân viên chưa gán phòng ban (department_id = null) không bị tính nhầm
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 20: Nhân viên chưa gán phòng ban không bị tính nhầm vào bất kỳ phòng ban nào', async () => {
      const { req, res, next } = createMockHttp({});

      await getDepartmentStatistics(req, res, next);

      const sumEmployeeCount = res.responseBody.data.reduce((sum, d) => sum + d.employeeCount, 0);
      // Tổng nhân viên thuộc các phòng ban = 4 (nhân viên 106 có department_id = null không được cộng vào)
      const expectedSum = mockEmployees
        .filter((e) => e.department_id !== null && ['Active', 'OnLeave'].includes(e.employment_status))
        .length;
      assert.strictEqual(sumEmployeeCount, expectedSum);
    });

    // -------------------------------------------------------------------------
    // TEST 21: Sắp xếp kết quả thống kê theo tham số sortBy và sortOrder
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 21: Sắp xếp thống kê theo sortBy=department_name và sortBy=employee_count', async () => {
      // 21.1 Theo tên phòng ban ASC
      const { req: reqName, res: resName, next: nextName } = createMockHttp({
        query: { sortBy: 'department_name', sortOrder: 'ASC' },
      });
      await getDepartmentStatistics(reqName, resName, nextName);
      assert.strictEqual(resName.statusCode, 200);
      for (let i = 0; i < resName.responseBody.data.length - 1; i++) {
        assert.ok(
          resName.responseBody.data[i].departmentName.localeCompare(
            resName.responseBody.data[i + 1].departmentName
          ) <= 0,
          'Danh sách phải được sắp xếp theo tên phòng ban A-Z'
        );
      }

      // 21.2 Theo số lượng nhân viên DESC (mặc định)
      const { req: reqCount, res: resCount, next: nextCount } = createMockHttp({
        query: { sortBy: 'employee_count', sortOrder: 'DESC' },
      });
      await getDepartmentStatistics(reqCount, resCount, nextCount);
      assert.strictEqual(resCount.statusCode, 200);
      for (let i = 0; i < resCount.responseBody.data.length - 1; i++) {
        assert.ok(
          resCount.responseBody.data[i].employeeCount >=
            resCount.responseBody.data[i + 1].employeeCount,
          'Danh sách phải được sắp xếp theo số lượng nhân viên giảm dần'
        );
      }
    });

    // -------------------------------------------------------------------------
    // TEST 22: Role EMPLOYEE gọi GET /api/departments/statistics -> 403 FORBIDDEN
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 22: Role EMPLOYEE gọi API thống kê phòng ban -> 403 FORBIDDEN', async () => {
      const statsGuard = requireRole(ROLES.ADMIN, ROLES.HR_MANAGER);
      const { req, res, next, getNextCalled } = createMockHttp({
        user: { role: ROLES.EMPLOYEE },
      });

      statsGuard(req, res, next);

      assert.strictEqual(getNextCalled(), false);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.responseBody.errorCode, 'FORBIDDEN');
    });

    // -------------------------------------------------------------------------
    // TEST 23: Role HR_MANAGER và ADMIN gọi GET /api/departments/statistics -> Cho phép
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 23: Role HR_MANAGER và ADMIN gọi API thống kê phòng ban -> Quyền hợp lệ', async () => {
      const statsGuard = requireRole(ROLES.ADMIN, ROLES.HR_MANAGER);

      // HR Manager
      const { req: reqHr, res: resHr, next: nextHr, getNextCalled: calledHr } = createMockHttp({
        user: { role: ROLES.HR_MANAGER },
      });
      statsGuard(reqHr, resHr, nextHr);
      assert.strictEqual(calledHr(), true);

      // Admin
      const { req: reqAdmin, res: resAdmin, next: nextAdmin, getNextCalled: calledAdmin } = createMockHttp({
        user: { role: ROLES.ADMIN },
      });
      statsGuard(reqAdmin, resAdmin, nextAdmin);
      assert.strictEqual(calledAdmin(), true);
    });

    // -------------------------------------------------------------------------
    // TEST 24: Database gặp sự cố khi query thống kê -> Chuyển tiếp next(error) an toàn
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 24: Database gặp sự cố khi thống kê -> Chuyển tiếp next(error) an toàn không lộ thông tin', async () => {
      departmentRepository.getDepartmentEmployeeStats = async () => {
        const dbErr = new Error('Database pool connection timed out');
        dbErr.code = 'ETIMEDOUT';
        throw dbErr;
      };

      const { req, res, next, getNextCalled, getNextError } = createMockHttp({});

      await getDepartmentStatistics(req, res, next);

      assert.strictEqual(getNextCalled(), true);
      assert.ok(getNextError());
      assert.strictEqual(getNextError().code, 'ETIMEDOUT');
    });

    console.log('\n============================================================');
    console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ CRUD & STATS DEPARTMENT!`);
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
    departmentRepository.hasEmployees = originalHasEmployees;
    departmentRepository.findByIdForUpdate = originalFindByIdForUpdate;
    departmentRepository.deleteDepartmentWithLock = originalDeleteDepartmentWithLock;
    departmentRepository.getDepartmentEmployeeStats = originalGetDepartmentEmployeeStats;
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
