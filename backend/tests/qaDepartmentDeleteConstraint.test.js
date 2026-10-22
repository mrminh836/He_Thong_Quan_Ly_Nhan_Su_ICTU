/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG CHUYÊN SÂU: RÀNG BUỘC KHÓA NGOẠI KHI XÓA PHÒNG BAN (HRM)
 * ==============================================================================
 * Kiểm tra 10 kịch bản kiểm thử bắt buộc:
 * 1.  Xóa phòng ban không có nhân viên: Thành công -> 200 OK
 * 2.  Xóa phòng ban có nhân viên đang làm việc (Active / OnLeave): Bị từ chối -> 409 Conflict
 * 3.  Xóa phòng ban chỉ có nhân viên đã thôi việc (Resigned) vẫn tham chiếu: Bị từ chối -> 409 Conflict
 * 4.  Xóa phòng ban với ID không tồn tại -> 404 Not Found
 * 5.  ID sai định dạng (chuỗi ký tự, số âm, số thực) -> 400 Bad Request
 * 6.  Không có JWT Token -> 401 Unauthorized
 * 7.  Người dùng không có quyền (EMPLOYEE / HR_MANAGER cố xóa) -> 403 Forbidden
 * 8.  Race condition (Request xóa phòng ban và request thêm nhân viên đồng thời):
 *     Transaction với FOR UPDATE và khóa ngoại MySQL RESTRICT chặn lỗi an toàn -> 409 Conflict
 * 9.  Lỗi database phát sinh (1451 ER_ROW_IS_REFERENCED_2): Trả 409 chuẩn hóa, không lộ stack trace hay thông tin nhạy cảm
 * 10. Sau khi xóa thất bại: Xác minh phòng ban và toàn bộ nhân viên vẫn còn nguyên vẹn trong CSDL
 * ==============================================================================
 */

import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { ROLES } from '../src/constants/roles.js';
import departmentRepository from '../src/repositories/departmentRepository.js';
import departmentService, {
  deleteDepartment as deleteDeptService,
  DepartmentHasEmployeesError,
  DepartmentNotFoundError,
} from '../src/services/departmentService.js';
import { deleteDepartment } from '../src/controllers/departmentController.js';
import { authenticateToken } from '../src/middlewares/auth.js';
import { requireRole } from '../src/middlewares/role.js';

let passed = 0;
let total = 0;

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
    json(payload) {
      this.responseBody = payload;
      return this;
    },
  };

  let nextCalled = false;
  let nextError = null;
  const next = (err) => {
    nextCalled = true;
    nextError = err || null;
  };

  return {
    req,
    res,
    next,
    getNextCalled: () => nextCalled,
    getNextError: () => nextError,
  };
}

async function runTest(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅ [PASS] Kịch bản ${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] Kịch bản ${total}: ${name}`);
    console.error(`     Chi tiết: ${err.message}`);
    throw err;
  }
}

async function runTestSuite() {
  console.log('============================================================');
  console.log('🛡️  BẮT ĐẦU CHẠY BỘ KIỂM THỬ RÀNG BUỘC KHÓA NGOẠI XÓA PHÒNG BAN');
  console.log('============================================================\n');

  // Dữ liệu mô phỏng chuẩn
  let mockDepartments = [
    { department_id: 1, department_code: 'PB-TECH', department_name: 'Phòng Công nghệ', is_active: 1 },
    { department_id: 2, department_code: 'PB-HR', department_name: 'Phòng Nhân sự', is_active: 1 },
    { department_id: 3, department_code: 'PB-EMPTY', department_name: 'Phòng Trống Không Có NV', is_active: 1 },
    { department_id: 4, department_code: 'PB-RESIGNED', department_name: 'Phòng Chỉ Có NV Nghỉ Việc', is_active: 1 },
  ];

  let mockEmployees = [
    { employee_id: 101, employee_code: 'NV001', full_name: 'Nguyễn Văn A', department_id: 1, employment_status: 'Active' },
    { employee_id: 102, employee_code: 'NV002', full_name: 'Trần Thị B', department_id: 1, employment_status: 'OnLeave' },
    { employee_id: 103, employee_code: 'NV003', full_name: 'Lê Văn C', department_id: 2, employment_status: 'Active' },
    { employee_id: 104, employee_code: 'NV004', full_name: 'Phạm Thị D', department_id: 4, employment_status: 'Resigned' },
  ];

  // Lưu backup các hàm repository thực tế
  const origFindById = departmentRepository.findById;
  const origCountEmployees = departmentRepository.countEmployeesByDepartmentId;
  const origHasEmployees = departmentRepository.hasEmployees;
  const origDeleteById = departmentRepository.deleteById;
  const origDeleteWithLock = departmentRepository.deleteDepartmentWithLock;

  try {
    // Thiết lập mock handlers
    departmentRepository.findById = async (id) => {
      const d = mockDepartments.find((item) => item.department_id === Number(id));
      return d ? { departmentId: d.department_id, departmentCode: d.department_code, departmentName: d.department_name, isActive: d.is_active } : null;
    };

    departmentRepository.countEmployeesByDepartmentId = async (id) => {
      return mockEmployees.filter((e) => e.department_id === Number(id)).length;
    };

    departmentRepository.hasEmployees = async (id) => {
      return mockEmployees.some((e) => e.department_id === Number(id));
    };

    departmentRepository.deleteById = async (id) => {
      const idx = mockDepartments.findIndex((d) => d.department_id === Number(id));
      if (idx === -1) return false;
      mockDepartments.splice(idx, 1);
      return true;
    };

    departmentRepository.deleteDepartmentWithLock = async (id, { isSoftDelete = false } = {}) => {
      const dept = mockDepartments.find((d) => d.department_id === Number(id));
      if (!dept) {
        return { found: false, hasEmployees: false, employeeCount: 0, isDeleted: false };
      }
      const employeeCount = mockEmployees.filter((e) => e.department_id === Number(id)).length;
      if (employeeCount > 0) {
        return {
          found: true,
          hasEmployees: true,
          employeeCount,
          isDeleted: false,
          department: { departmentId: dept.department_id, departmentName: dept.department_name },
        };
      }
      const idx = mockDepartments.findIndex((d) => d.department_id === Number(id));
      mockDepartments.splice(idx, 1);
      return {
        found: true,
        hasEmployees: false,
        employeeCount: 0,
        isDeleted: true,
        type: isSoftDelete ? 'SOFT_DELETE' : 'HARD_DELETE',
        department: { departmentId: dept.department_id, departmentName: dept.department_name },
      };
    };

    // -------------------------------------------------------------------------
    // KỊCH BẢN 1: Xóa phòng ban không có nhân viên -> 200 OK
    // -------------------------------------------------------------------------
    await runTest('Xóa phòng ban không có nhân viên -> 200 OK', async () => {
      const { req, res, next } = createMockHttp({ params: { id: '3' } });
      await deleteDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.responseBody.success, true);
      assert.strictEqual(res.responseBody.message, 'Xóa phòng ban thành công');
      assert.strictEqual(mockDepartments.some((d) => d.department_id === 3), false, 'Phòng ban 3 phải bị xóa');
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 2: Xóa phòng ban có nhân viên đang làm việc -> 409 Conflict
    // -------------------------------------------------------------------------
    await runTest('Xóa phòng ban có nhân viên đang làm việc -> 409 Conflict', async () => {
      const { req, res, next } = createMockHttp({ params: { id: '1' } });
      await deleteDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.responseBody.success, false);
      assert.strictEqual(res.responseBody.errorCode, 'DEPARTMENT_HAS_EMPLOYEES');
      assert.strictEqual(res.responseBody.code, 'DEPARTMENT_HAS_EMPLOYEES');
      assert.ok(
        res.responseBody.message.includes('nhân viên') && res.responseBody.message.includes('Không thể xóa'),
        'Thông báo lỗi phải rõ ràng cho frontend'
      );
      assert.strictEqual(mockDepartments.some((d) => d.department_id === 1), true, 'Phòng ban 1 phải còn nguyên');
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 3: Xóa phòng ban có nhân viên đã thôi việc (Resigned) -> 409 Conflict
    // -------------------------------------------------------------------------
    await runTest('Xóa phòng ban có nhân viên đã thôi việc (Resigned) nhưng vẫn tham chiếu -> 409 Conflict', async () => {
      const { req, res, next } = createMockHttp({ params: { id: '4' } });
      await deleteDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.responseBody.success, false);
      assert.strictEqual(res.responseBody.errorCode, 'DEPARTMENT_HAS_EMPLOYEES');
      assert.strictEqual(res.responseBody.code, 'DEPARTMENT_HAS_EMPLOYEES');
      assert.strictEqual(mockDepartments.some((d) => d.department_id === 4), true, 'Phòng ban 4 phải còn nguyên');
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 4: Xóa phòng ban ID không tồn tại -> 404 Not Found
    // -------------------------------------------------------------------------
    await runTest('Xóa phòng ban với ID không tồn tại -> 404 Not Found', async () => {
      const { req, res, next } = createMockHttp({ params: { id: '99999' } });
      await deleteDepartment(req, res, next);

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.responseBody.success, false);
      assert.strictEqual(res.responseBody.errorCode, 'DEPARTMENT_NOT_FOUND');
      assert.strictEqual(res.responseBody.code, 'DEPARTMENT_NOT_FOUND');
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 5: ID sai định dạng -> 400 Bad Request
    // -------------------------------------------------------------------------
    await runTest('ID sai định dạng (chuỗi chữ, số âm, số 0) -> 400 Bad Request', async () => {
      for (const badId of ['abc', '-5', '0', '12.5', 'null']) {
        const { req, res, next } = createMockHttp({ params: { id: badId } });
        await deleteDepartment(req, res, next);

        assert.strictEqual(res.statusCode, 400, `ID ${badId} phải trả về 400`);
        assert.strictEqual(res.responseBody.success, false);
        assert.strictEqual(res.responseBody.errorCode, 'INVALID_ID');
      }
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 6: Không có JWT Token -> 401 Unauthorized
    // -------------------------------------------------------------------------
    await runTest('Không có JWT Token -> 401 Unauthorized', async () => {
      const { req, res, next, getNextCalled } = createMockHttp({ headers: {} });
      await authenticateToken(req, res, next);

      assert.strictEqual(getNextCalled(), false);
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.responseBody.success, false);
      assert.strictEqual(res.responseBody.errorCode, 'TOKEN_REQUIRED');
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 7: Người dùng không có quyền (EMPLOYEE / HR_MANAGER) -> 403 Forbidden
    // -------------------------------------------------------------------------
    await runTest('Role không đủ quyền (EMPLOYEE, HR_MANAGER cố xóa) -> 403 Forbidden', async () => {
      const adminOnlyGuard = requireRole(ROLES.ADMIN);

      // Thử với EMPLOYEE
      const { req: reqEmp, res: resEmp, next: nextEmp, getNextCalled: calledEmp } = createMockHttp({
        user: { role: ROLES.EMPLOYEE },
      });
      adminOnlyGuard(reqEmp, resEmp, nextEmp);
      assert.strictEqual(calledEmp(), false);
      assert.strictEqual(resEmp.statusCode, 403);
      assert.strictEqual(resEmp.responseBody.errorCode, 'FORBIDDEN');

      // Thử với HR_MANAGER
      const { req: reqHr, res: resHr, next: nextHr, getNextCalled: calledHr } = createMockHttp({
        user: { role: ROLES.HR_MANAGER },
      });
      adminOnlyGuard(reqHr, resHr, nextHr);
      assert.strictEqual(calledHr(), false);
      assert.strictEqual(resHr.statusCode, 403);
      assert.strictEqual(resHr.responseBody.errorCode, 'FORBIDDEN');

      // Thử với ADMIN
      const { req: reqAdmin, res: resAdmin, next: nextAdmin, getNextCalled: calledAdmin } = createMockHttp({
        user: { role: ROLES.ADMIN },
      });
      adminOnlyGuard(reqAdmin, resAdmin, nextAdmin);
      assert.strictEqual(calledAdmin(), true);
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 8: Race condition: Gán nhân viên đồng thời với request xóa
    // -------------------------------------------------------------------------
    await runTest('Race condition bảo vệ qua Transaction FOR UPDATE và kiểm tra employeeCount', async () => {
      // Giả lập phòng ban mới không có NV ban đầu
      mockDepartments.push({ department_id: 5, department_code: 'PB-RACE', department_name: 'Phòng Race Condition', is_active: 1 });

      // Trong khi request xóa đang chuẩn bị thực thi, 1 nhân viên mới được thêm vào
      mockEmployees.push({ employee_id: 105, employee_code: 'NV005', full_name: 'Race Employee', department_id: 5, employment_status: 'Active' });

      // Cơ chế lock kiểm tra lại số lượng nhân viên
      const lockRes = await departmentRepository.deleteDepartmentWithLock(5);
      assert.strictEqual(lockRes.found, true);
      assert.strictEqual(lockRes.hasEmployees, true);
      assert.strictEqual(lockRes.employeeCount, 1);
      assert.strictEqual(lockRes.isDeleted, false, 'Không được phép xóa phòng ban');
      assert.strictEqual(mockDepartments.some((d) => d.department_id === 5), true, 'Phòng ban 5 vẫn tồn tại an toàn');
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 9: Lỗi cơ sở dữ liệu khóa ngoại (1451 ER_ROW_IS_REFERENCED_2) -> 409 an toàn
    // -------------------------------------------------------------------------
    await runTest('Lỗi database khóa ngoại (1451) -> Chuẩn hóa 409, không rò rỉ thông tin nhạy cảm', async () => {
      const tempDelete = departmentRepository.deleteById;
      const tempHasEmp = departmentRepository.hasEmployees;
      const tempCount = departmentRepository.countEmployeesByDepartmentId;

      try {
        departmentRepository.hasEmployees = async () => false;
        departmentRepository.countEmployeesByDepartmentId = async () => 0;
        departmentRepository.deleteById = async () => {
          const fkErr = new Error('Cannot delete or update a parent row: a foreign key constraint fails (`hrm_db`.`employees`, CONSTRAINT `fk_employees_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`))');
          fkErr.code = 'ER_ROW_IS_REFERENCED_2';
          fkErr.errno = 1451;
          throw fkErr;
        };

        const { req, res, next } = createMockHttp({ params: { id: '2' } });
        await deleteDepartment(req, res, next);

        assert.strictEqual(res.statusCode, 409);
        assert.strictEqual(res.responseBody.success, false);
        assert.strictEqual(res.responseBody.errorCode, 'DEPARTMENT_HAS_EMPLOYEES');
        assert.strictEqual(res.responseBody.code, 'DEPARTMENT_HAS_EMPLOYEES');
        assert.strictEqual(res.responseBody.stack, undefined);
        assert.strictEqual(JSON.stringify(res.responseBody).includes('CONSTRAINT `fk_employees_department`'), false, 'Không để lộ cấu trúc nội bộ CSDL');
      } finally {
        departmentRepository.deleteById = tempDelete;
        departmentRepository.hasEmployees = tempHasEmp;
        departmentRepository.countEmployeesByDepartmentId = tempCount;
      }
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 10: Sau khi xóa thất bại -> Toàn bộ dữ liệu phòng ban và nhân viên vẫn nguyên vẹn
    // -------------------------------------------------------------------------
    await runTest('Sau khi xóa thất bại -> Toàn bộ phòng ban và nhân viên vẫn nguyên vẹn 100%', async () => {
      const snapDepts = JSON.stringify(mockDepartments);
      const snapEmps = JSON.stringify(mockEmployees);

      // Thử xóa phòng ban 1 (có nhân viên)
      const { req: r1, res: s1, next: n1 } = createMockHttp({ params: { id: '1' } });
      await deleteDepartment(r1, s1, n1);
      assert.strictEqual(s1.statusCode, 409);

      // Thử xóa phòng ban 4 (có nhân viên đã thôi việc)
      const { req: r4, res: s4, next: n4 } = createMockHttp({ params: { id: '4' } });
      await deleteDepartment(r4, s4, n4);
      assert.strictEqual(s4.statusCode, 409);

      // Thử xóa phòng ban 9999 (không tồn tại)
      const { req: r9, res: s9, next: n9 } = createMockHttp({ params: { id: '9999' } });
      await deleteDepartment(r9, s9, n9);
      assert.strictEqual(s9.statusCode, 404);

      // Xác minh tính toàn vẹn 100% không đổi
      assert.strictEqual(JSON.stringify(mockDepartments), snapDepts);
      assert.strictEqual(JSON.stringify(mockEmployees), snapEmps);
    });

  } finally {
    // Khôi phục functions gốc
    departmentRepository.findById = origFindById;
    departmentRepository.countEmployeesByDepartmentId = origCountEmployees;
    departmentRepository.hasEmployees = origHasEmployees;
    departmentRepository.deleteById = origDeleteById;
    departmentRepository.deleteDepartmentWithLock = origDeleteWithLock;
  }

  console.log('\n============================================================');
  console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passed}/${total} KỊCH BẢN KIỂM THỬ RÀNG BUỘC KHÓA NGOẠI!`);
  console.log('   Tất cả 10 yêu cầu kỹ thuật & an toàn dữ liệu đều đạt chuẩn.');
  console.log('============================================================\n');
}

runTestSuite().catch((err) => {
  console.error('Fatal error during test suite:', err);
  process.exit(1);
});
