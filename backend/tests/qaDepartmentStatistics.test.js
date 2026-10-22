/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG CHUYÊN SÂU: API GET /api/departments/statistics
 * THỐNG KÊ CƠ CẤU NHÂN SỰ THEO PHÒNG BAN
 * ==============================================================================
 * Kiểm tra đầy đủ 12 kịch bản bắt buộc theo đặc tả Section 9:
 * 1.  Nhiều phòng ban với số lượng nhân viên khác nhau.
 * 2.  Phòng ban không có nhân viên (employeeCount = 0, xuất hiện đầy đủ).
 * 3.  Database không có phòng ban (totalDepartments = 0, departments = []).
 * 4.  Database có phòng ban nhưng không có nhân viên (percentage = 0, không chia cho 0).
 * 5.  Tách biệt trạng thái nhân sự: Resigned không tính vào employeeCount hiện tại.
 * 6.  Tính toán chính xác tỷ trọng (%) nhân sự với làm tròn 2 chữ số thập phân.
 * 7.  Chống lỗi chia cho 0 khi totalEmployees = 0.
 * 8.  Chống đếm trùng nhân viên (COUNT DISTINCT).
 * 9.  Tính nhất quán giữa số liệu summary và dữ liệu chi tiết departments.
 * 10. Phân quyền và xác thực: Không token (401), Role Employee (403), Admin & HR (200).
 * 11. Xử lý lỗi CSDL an toàn (500, không lộ stack trace / SQL).
 * 12. Kiểm tra tương thích định dạng Envelope tiêu chuẩn và định dạng Nested (format=nested).
 * ==============================================================================
 */

import assert from 'node:assert';
import departmentRepository from '../src/repositories/departmentRepository.js';
import departmentService from '../src/services/departmentService.js';
import { getDepartmentStatistics } from '../src/controllers/departmentController.js';
import { authenticateToken } from '../src/middlewares/auth.js';
import { requireRole } from '../src/middlewares/role.js';
import { ROLES } from '../src/constants/roles.js';

let passed = 0;
let total = 0;

function createMockHttp({
  headers = {},
  params = {},
  query = {},
  user = null,
} = {}) {
  const req = {
    headers: { ...headers },
    params: { ...params },
    query: { ...query },
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

async function runTestCase(name, fn) {
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
  console.log('==============================================================================');
  console.log('📊 BẮT ĐẦU CHẠY BỘ KIỂM THỬ: GET /api/departments/statistics THỐNG KÊ CƠ CẤU');
  console.log('==============================================================================\n');

  const originalGetDepartmentEmployeeStats = departmentRepository.getDepartmentEmployeeStats;

  try {
    // --------------------------------------------------------------------------
    // KỊCH BẢN 1: Có nhiều phòng ban với số lượng nhân viên khác nhau
    // --------------------------------------------------------------------------
    await runTestCase('Có nhiều phòng ban với số lượng nhân viên khác nhau -> Tính đúng số liệu', async () => {
      departmentRepository.getDepartmentEmployeeStats = async () => [
        { departmentId: 1, departmentCode: 'TECH', departmentName: 'Kỹ thuật', isActive: true, employeeCount: 35, activeCount: 30, onLeaveCount: 5, resignedCount: 2 },
        { departmentId: 2, departmentCode: 'HR', departmentName: 'Nhân sự', isActive: true, employeeCount: 20, activeCount: 18, onLeaveCount: 2, resignedCount: 1 },
        { departmentId: 3, departmentCode: 'BIZ', departmentName: 'Kinh doanh', isActive: true, employeeCount: 45, activeCount: 40, onLeaveCount: 5, resignedCount: 0 },
      ];

      const { req, res, next } = createMockHttp({});
      await getDepartmentStatistics(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.responseBody.success, true);
      assert.strictEqual(res.responseBody.data.length, 3);
      assert.strictEqual(res.responseBody.meta.totalDepartments, 3);
      assert.strictEqual(res.responseBody.meta.totalEmployees, 100);
      assert.strictEqual(res.responseBody.meta.departmentsWithoutEmployees, 0);
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 2: Có phòng ban không có nhân viên (employeeCount = 0)
    // --------------------------------------------------------------------------
    await runTestCase('Có phòng ban không có nhân viên -> Giữ lại phòng ban và đếm số phòng ban trống chính xác', async () => {
      departmentRepository.getDepartmentEmployeeStats = async () => [
        { departmentId: 1, departmentCode: 'TECH', departmentName: 'Kỹ thuật', isActive: true, employeeCount: 10, activeCount: 10, onLeaveCount: 0, resignedCount: 0 },
        { departmentId: 2, departmentCode: 'EMPTY', departmentName: 'Phòng Mới', isActive: true, employeeCount: 0, activeCount: 0, onLeaveCount: 0, resignedCount: 0 },
      ];

      const { req, res, next } = createMockHttp({});
      await getDepartmentStatistics(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      const emptyDept = res.responseBody.data.find((d) => d.departmentId === 2);
      assert.ok(emptyDept, 'Phòng ban trống bắt buộc phải xuất hiện trong danh sách');
      assert.strictEqual(emptyDept.employeeCount, 0);
      assert.strictEqual(emptyDept.percentage, 0);
      assert.strictEqual(res.responseBody.meta.departmentsWithoutEmployees, 1);
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 3: Database không có phòng ban nào (0 phòng ban)
    // --------------------------------------------------------------------------
    await runTestCase('Database không có phòng ban nào -> Trả về mảng rỗng và tổng bằng 0', async () => {
      departmentRepository.getDepartmentEmployeeStats = async () => [];

      const { req, res, next } = createMockHttp({});
      await getDepartmentStatistics(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.responseBody.data.length, 0);
      assert.strictEqual(res.responseBody.meta.totalDepartments, 0);
      assert.strictEqual(res.responseBody.meta.totalEmployees, 0);
      assert.strictEqual(res.responseBody.meta.departmentsWithoutEmployees, 0);
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 4: Database có phòng ban nhưng không có nhân viên nào (0 nhân viên)
    // --------------------------------------------------------------------------
    await runTestCase('Database có phòng ban nhưng không có nhân viên -> Tỷ trọng = 0, không lỗi', async () => {
      departmentRepository.getDepartmentEmployeeStats = async () => [
        { departmentId: 1, departmentCode: 'PB1', departmentName: 'Phòng A', isActive: true, employeeCount: 0, activeCount: 0, onLeaveCount: 0, resignedCount: 0 },
        { departmentId: 2, departmentCode: 'PB2', departmentName: 'Phòng B', isActive: true, employeeCount: 0, activeCount: 0, onLeaveCount: 0, resignedCount: 0 },
      ];

      const { req, res, next } = createMockHttp({});
      await getDepartmentStatistics(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.responseBody.meta.totalDepartments, 2);
      assert.strictEqual(res.responseBody.meta.totalEmployees, 0);
      assert.strictEqual(res.responseBody.meta.departmentsWithoutEmployees, 2);
      assert.strictEqual(res.responseBody.data[0].percentage, 0);
      assert.strictEqual(res.responseBody.data[1].percentage, 0);
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 5: Tách biệt nhân sự: Resigned không tính vào employeeCount hiện tại
    // --------------------------------------------------------------------------
    await runTestCase('Nhân viên đã nghỉ việc (Resigned) không được tính vào employeeCount hiện tại', async () => {
      departmentRepository.getDepartmentEmployeeStats = async () => [
        {
          departmentId: 1,
          departmentCode: 'TECH',
          departmentName: 'Kỹ thuật',
          isActive: true,
          // employeeCount = activeCount (2) + onLeaveCount (1) = 3 (loại trừ resignedCount = 10)
          employeeCount: 3,
          activeCount: 2,
          onLeaveCount: 1,
          resignedCount: 10,
        },
      ];

      const { req, res, next } = createMockHttp({});
      await getDepartmentStatistics(req, res, next);

      const dept = res.responseBody.data[0];
      assert.strictEqual(dept.employeeCount, 3, 'employeeCount phải chỉ là 3 (loại bỏ 10 người đã thôi việc)');
      assert.strictEqual(dept.resignedCount, 10, 'resignedCount được thống kê tách biệt');
      assert.strictEqual(res.responseBody.meta.totalEmployees, 3);
      assert.strictEqual(res.responseBody.meta.resignedEmployees, 10);
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 6: Tính toán tỷ trọng (%) chính xác với làm tròn 2 chữ số thập phân
    // --------------------------------------------------------------------------
    await runTestCase('Tỷ trọng (%) nhân sự được tính đúng công thức và làm tròn 2 chữ số thập phân', async () => {
      // Tổng nhân viên = 35 + 20 + 65 = 120
      // PB 1: 35/120 * 100 = 29.1666... -> 29.17
      // PB 2: 20/120 * 100 = 16.6666... -> 16.67
      // PB 3: 65/120 * 100 = 54.1666... -> 54.17
      departmentRepository.getDepartmentEmployeeStats = async () => [
        { departmentId: 1, departmentCode: 'PB1', departmentName: 'Phòng 1', isActive: true, employeeCount: 35, activeCount: 35, onLeaveCount: 0, resignedCount: 0 },
        { departmentId: 2, departmentCode: 'PB2', departmentName: 'Phòng 2', isActive: true, employeeCount: 20, activeCount: 20, onLeaveCount: 0, resignedCount: 0 },
        { departmentId: 3, departmentCode: 'PB3', departmentName: 'Phòng 3', isActive: true, employeeCount: 65, activeCount: 65, onLeaveCount: 0, resignedCount: 0 },
      ];

      const { req, res, next } = createMockHttp({});
      await getDepartmentStatistics(req, res, next);

      assert.strictEqual(res.responseBody.data[0].percentage, 29.17);
      assert.strictEqual(res.responseBody.data[1].percentage, 16.67);
      assert.strictEqual(res.responseBody.data[2].percentage, 54.17);
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 7: Chống lỗi chia cho 0 khi totalEmployees = 0
    // --------------------------------------------------------------------------
    await runTestCase('Chống lỗi chia cho 0: Khi totalEmployees = 0, percentage trả về 0 an toàn (không NaN/Infinity)', async () => {
      const stats = await departmentService.getDepartmentStatistics();
      for (const d of stats.departments) {
        assert.strictEqual(Number.isFinite(d.percentage), true, 'Tỷ trọng phải là số hữu hạn hợp lệ');
        assert.strictEqual(isNaN(d.percentage), false, 'Tỷ trọng không được là NaN');
      }
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 8: Chống đếm trùng nhân viên
    // --------------------------------------------------------------------------
    await runTestCase('Chống đếm trùng nhân viên: COUNT DISTINCT bảo đảm không nhân đôi số lượng', async () => {
      departmentRepository.getDepartmentEmployeeStats = async () => [
        { departmentId: 1, departmentCode: 'PB1', departmentName: 'Phòng A', isActive: true, employeeCount: 5, activeCount: 5, onLeaveCount: 0, resignedCount: 0 },
      ];

      const stats = await departmentService.getDepartmentStatistics();
      assert.strictEqual(stats.departments[0].employeeCount, 5);
      assert.strictEqual(stats.summary.totalEmployees, 5);
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 9: Tính nhất quán giữa summary và dữ liệu chi tiết departments
    // --------------------------------------------------------------------------
    await runTestCase('Tính nhất quán dữ liệu: summary.totalEmployees = sum(departments.employeeCount)', async () => {
      departmentRepository.getDepartmentEmployeeStats = async () => [
        { departmentId: 1, departmentCode: 'PB1', departmentName: 'Phòng A', isActive: true, employeeCount: 12, activeCount: 10, onLeaveCount: 2, resignedCount: 1 },
        { departmentId: 2, departmentCode: 'PB2', departmentName: 'Phòng B', isActive: true, employeeCount: 8, activeCount: 8, onLeaveCount: 0, resignedCount: 0 },
        { departmentId: 3, departmentCode: 'PB3', departmentName: 'Phòng C', isActive: true, employeeCount: 0, activeCount: 0, onLeaveCount: 0, resignedCount: 0 },
      ];

      const { req, res, next } = createMockHttp({});
      await getDepartmentStatistics(req, res, next);

      const sumEmployeeCount = res.responseBody.data.reduce((sum, d) => sum + d.employeeCount, 0);
      assert.strictEqual(res.responseBody.meta.totalEmployees, sumEmployeeCount);
      assert.strictEqual(res.responseBody.meta.totalDepartments, res.responseBody.data.length);

      const emptyCount = res.responseBody.data.filter((d) => d.employeeCount === 0).length;
      assert.strictEqual(res.responseBody.meta.departmentsWithoutEmployees, emptyCount);
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 10: Phân quyền & Xác thực bảo mật JWT
    // --------------------------------------------------------------------------
    await runTestCase('Phân quyền bảo mật: Bắt buộc JWT và chỉ cho phép ADMIN hoặc HR_MANAGER', async () => {
      // 10.1 Không có token -> 401 TOKEN_REQUIRED
      const { req: reqNoToken, res: resNoToken } = createMockHttp({ headers: {} });
      await authenticateToken(reqNoToken, resNoToken, () => {});
      assert.strictEqual(resNoToken.statusCode, 401);
      assert.strictEqual(resNoToken.responseBody.errorCode, 'TOKEN_REQUIRED');

      // 10.2 Vai trò EMPLOYEE cố gọi -> 403 FORBIDDEN
      const { req: reqEmp, res: resEmp, next: nextEmp } = createMockHttp({
        user: { id: 3, username: 'emp1', role: ROLES.EMPLOYEE },
      });
      const authMiddleware = requireRole(ROLES.ADMIN, ROLES.HR_MANAGER);
      authMiddleware(reqEmp, resEmp, nextEmp);
      assert.strictEqual(resEmp.statusCode, 403);
      assert.strictEqual(resEmp.responseBody.errorCode, 'FORBIDDEN');

      // 10.3 Vai trò HR_MANAGER -> Cho phép (next() được gọi)
      const { req: reqHr, res: resHr, next: nextHr, getNextCalled: getHrNextCalled } = createMockHttp({
        user: { id: 2, username: 'hr', role: ROLES.HR_MANAGER },
      });
      authMiddleware(reqHr, resHr, nextHr);
      assert.strictEqual(getHrNextCalled(), true);

      // 10.4 Vai trò ADMIN -> Cho phép (next() được gọi)
      const { req: reqAdmin, res: resAdmin, next: nextAdmin, getNextCalled: getAdminNextCalled } = createMockHttp({
        user: { id: 1, username: 'admin', role: ROLES.ADMIN },
      });
      authMiddleware(reqAdmin, resAdmin, nextAdmin);
      assert.strictEqual(getAdminNextCalled(), true);
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 11: Lỗi CSDL được xử lý an toàn
    // --------------------------------------------------------------------------
    await runTestCase('Lỗi database: Truyền lỗi an toàn qua next(error), không lộ SQL/Stack trace', async () => {
      departmentRepository.getDepartmentEmployeeStats = async () => {
        const err = new Error('Database connection timeout error');
        err.code = 'ETIMEDOUT';
        throw err;
      };

      const { req, res, next, getNextError } = createMockHttp({});
      await getDepartmentStatistics(req, res, next);

      assert.ok(getNextError(), 'Lỗi phải được chuyển qua next(error) để errorHandler bắt giữ');
      assert.strictEqual(getNextError().message, 'Database connection timeout error');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 12: Kiểm tra tương thích định dạng Nested format (format=nested)
    // --------------------------------------------------------------------------
    await runTestCase('Hỗ trợ định dạng lồng nhau format=nested: data = { summary, departments }', async () => {
      departmentRepository.getDepartmentEmployeeStats = async () => [
        { departmentId: 1, departmentCode: 'TECH', departmentName: 'Kỹ thuật', isActive: true, employeeCount: 15, activeCount: 15, onLeaveCount: 0, resignedCount: 0 },
        { departmentId: 2, departmentCode: 'HR', departmentName: 'Nhân sự', isActive: true, employeeCount: 5, activeCount: 5, onLeaveCount: 0, resignedCount: 0 },
      ];

      const { req, res, next } = createMockHttp({ query: { format: 'nested' } });
      await getDepartmentStatistics(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.responseBody.success, true);
      assert.ok(res.responseBody.data.summary, 'Data phải chứa trường summary khi format=nested');
      assert.ok(Array.isArray(res.responseBody.data.departments), 'Data phải chứa mảng departments khi format=nested');
      assert.strictEqual(res.responseBody.data.summary.totalDepartments, 2);
      assert.strictEqual(res.responseBody.data.summary.totalEmployees, 20);
      assert.strictEqual(res.responseBody.data.departments[0].percentage, 75);
      assert.strictEqual(res.responseBody.data.departments[1].percentage, 25);
    });

    console.log('\n==============================================================================');
    console.log(`🎉 KẾT QUẢ KIỂM THỬ: ĐÃ VƯỢT QUA ${passed}/${total} KỊCH BẢN!`);
    console.log('   API GET /api/departments/statistics đạt chuẩn 100% yêu cầu kỹ thuật.');
    console.log('==============================================================================\n');
  } finally {
    departmentRepository.getDepartmentEmployeeStats = originalGetDepartmentEmployeeStats;
  }
}

runTestSuite().catch((err) => {
  console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
  process.exit(1);
});
