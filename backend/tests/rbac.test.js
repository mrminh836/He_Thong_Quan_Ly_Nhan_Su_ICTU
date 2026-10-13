/**
 * BỘ KIỂM THỬ TỰ ĐỘNG: AUTH MIDDLEWARE & ROLE-BASED ACCESS CONTROL (RBAC) (HRM ICTU)
 * Bao gồm đầy đủ 15 tình huống kiểm thử bắt buộc:
 * 1. Request không có Authorization header -> 401
 * 2. Header không theo định dạng Bearer -> 401
 * 3. Token sai chữ ký -> 401
 * 4. Token hết hạn -> 401
 * 5. Token thiếu claim định danh bắt buộc -> 401
 * 6. Token hợp lệ của Admin -> 200 / Next
 * 7. Token hợp lệ của HR Manager -> 200 / Next
 * 8. Token hợp lệ của Employee -> 200 / Next
 * 9. Employee truy cập API chỉ dành cho Admin -> 403
 * 10. HR Manager truy cập API chỉ dành cho Admin -> 403
 * 11. Admin truy cập endpoint yêu cầu Admin -> Next
 * 12. Người dùng đã bị khóa trong DB nhưng token vẫn còn hạn -> 403 (Real-time DB check)
 * 13. Người dùng có role không hợp lệ trong DB -> 403
 * 14. Database gặp lỗi trong quá trình xác minh tài khoản -> next(error) an toàn
 * 15. Employee cố truy cập hồ sơ/chấm công của người khác -> 403 Ownership Guard
 */

import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../src/middlewares/auth.js';
import { requireRole } from '../src/middlewares/role.js';
import { requireOwnershipOrRole } from '../src/middlewares/ownership.js';
import userRepository from '../src/repositories/userRepository.js';
import { env } from '../src/config/env.js';
import { ROLES } from '../src/constants/roles.js';

let passedTests = 0;
let totalTests = 0;

/**
 * Tiện ích tạo đối tượng Mock Express Request & Response
 */
function createMockHttp({ headers = {}, params = {}, query = {}, body = {}, user = null } = {}) {
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

  return { req, res, next, getNextCalled: () => nextCalled, getNextError: () => nextError };
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
  console.log('🛡️ BẮT ĐẦU CHẠY BỘ KIỂM THỬ AUTH MIDDLEWARE & RBAC (15 CASES)');
  console.log('============================================================\n');

  // Dữ liệu người dùng mẫu
  const mockAdminUser = {
    user_id: 1,
    employee_id: 1,
    username: 'admin',
    role: 'Admin',
    account_status: 'Active',
    full_name: 'Quản trị viên',
    email: 'admin@hrm.local',
  };

  const mockHrUser = {
    user_id: 2,
    employee_id: 2,
    username: 'hr_manager',
    role: 'HR',
    account_status: 'Active',
    full_name: 'Quản lý Nhân sự',
    email: 'hr@hrm.local',
  };

  const mockEmployeeUser = {
    user_id: 3,
    employee_id: 101,
    username: 'emp_nam',
    role: 'Employee',
    account_status: 'Active',
    full_name: 'Trần Văn Nam',
    email: 'nam.tv@hrm.local',
  };

  // Tạo token JWT hợp lệ cho 3 vai trò
  const adminToken = jwt.sign({ sub: 1, username: 'admin', role: 'Admin' }, env.jwtSecret, { algorithm: 'HS256', expiresIn: '1h' });
  const hrToken = jwt.sign({ sub: 2, username: 'hr_manager', role: 'HR' }, env.jwtSecret, { algorithm: 'HS256', expiresIn: '1h' });
  const employeeToken = jwt.sign({ sub: 3, username: 'emp_nam', role: 'Employee', employeeId: 101 }, env.jwtSecret, { algorithm: 'HS256', expiresIn: '1h' });

  // Lưu repository gốc
  const originalFindById = userRepository.findById;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Request không có Authorization header
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 1: Request không có Authorization header -> 401 TOKEN_REQUIRED', async () => {
      const { req, res, next, getNextCalled } = createMockHttp();
      await authenticateToken(req, res, next);

      assert.strictEqual(getNextCalled(), false);
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.responseBody.errorCode, 'TOKEN_REQUIRED');
      assert.strictEqual(res.responseBody.success, false);
    });

    // -------------------------------------------------------------------------
    // TEST 2: Header không theo định dạng Bearer
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 2: Header không theo định dạng Bearer (Basic/Token) -> 401 INVALID_TOKEN_FORMAT', async () => {
      const { req, res, next, getNextCalled } = createMockHttp({
        headers: { authorization: 'Basic YWRtaW46cGFzc3dvcmQ=' },
      });
      await authenticateToken(req, res, next);

      assert.strictEqual(getNextCalled(), false);
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.responseBody.errorCode, 'INVALID_TOKEN_FORMAT');
    });

    // -------------------------------------------------------------------------
    // TEST 3: Token sai chữ ký
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 3: Token sai chữ ký (ký bằng secret giả) -> 401 INVALID_TOKEN', async () => {
      const forgedToken = jwt.sign({ sub: 1, role: 'Admin' }, 'WRONG_SECRET_KEY', { algorithm: 'HS256' });
      const { req, res, next, getNextCalled } = createMockHttp({
        headers: { authorization: `Bearer ${forgedToken}` },
      });
      await authenticateToken(req, res, next);

      assert.strictEqual(getNextCalled(), false);
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.responseBody.errorCode, 'INVALID_TOKEN');
    });

    // -------------------------------------------------------------------------
    // TEST 4: Token hết hạn
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 4: Token đã hết hạn (expired) -> 401 TOKEN_EXPIRED', async () => {
      const expiredToken = jwt.sign({ sub: 1, role: 'Admin' }, env.jwtSecret, { algorithm: 'HS256', expiresIn: '-1s' });
      const { req, res, next, getNextCalled } = createMockHttp({
        headers: { authorization: `Bearer ${expiredToken}` },
      });
      await authenticateToken(req, res, next);

      assert.strictEqual(getNextCalled(), false);
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.responseBody.errorCode, 'TOKEN_EXPIRED');
    });

    // -------------------------------------------------------------------------
    // TEST 5: Token thiếu claim định danh bắt buộc (sub)
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 5: Token thiếu claim định danh bắt buộc (sub) -> 401 INVALID_TOKEN_CLAIMS', async () => {
      const tokenWithoutSub = jwt.sign({ role: 'Admin', username: 'admin' }, env.jwtSecret, { algorithm: 'HS256' });
      const { req, res, next, getNextCalled } = createMockHttp({
        headers: { authorization: `Bearer ${tokenWithoutSub}` },
      });
      await authenticateToken(req, res, next);

      assert.strictEqual(getNextCalled(), false);
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.responseBody.errorCode, 'INVALID_TOKEN_CLAIMS');
    });

    // -------------------------------------------------------------------------
    // TEST 6: Token hợp lệ của Admin
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 6: Token hợp lệ của Admin -> Gọi next() và gắn req.user.role=ADMIN', async () => {
      userRepository.findById = async (id) => (id === 1 ? mockAdminUser : null);

      const { req, res, next, getNextCalled } = createMockHttp({
        headers: { authorization: `Bearer ${adminToken}` },
      });
      await authenticateToken(req, res, next);

      assert.strictEqual(getNextCalled(), true);
      assert.strictEqual(req.user.role, ROLES.ADMIN);
      assert.strictEqual(req.user.username, 'admin');
    });

    // -------------------------------------------------------------------------
    // TEST 7: Token hợp lệ của HR Manager
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 7: Token hợp lệ của HR Manager -> Gọi next() và chuẩn hóa role HR_MANAGER', async () => {
      userRepository.findById = async (id) => (id === 2 ? mockHrUser : null);

      const { req, res, next, getNextCalled } = createMockHttp({
        headers: { authorization: `Bearer ${hrToken}` },
      });
      await authenticateToken(req, res, next);

      assert.strictEqual(getNextCalled(), true);
      assert.strictEqual(req.user.role, ROLES.HR_MANAGER);
    });

    // -------------------------------------------------------------------------
    // TEST 8: Token hợp lệ của Employee
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 8: Token hợp lệ của Employee -> Gọi next() và gắn role EMPLOYEE', async () => {
      userRepository.findById = async (id) => (id === 3 ? mockEmployeeUser : null);

      const { req, res, next, getNextCalled } = createMockHttp({
        headers: { authorization: `Bearer ${employeeToken}` },
      });
      await authenticateToken(req, res, next);

      assert.strictEqual(getNextCalled(), true);
      assert.strictEqual(req.user.role, ROLES.EMPLOYEE);
      assert.strictEqual(req.user.employeeId, 101);
    });

    // -------------------------------------------------------------------------
    // TEST 9: Employee truy cập API chỉ dành cho Admin -> 403
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 9: Employee truy cập API yêu cầu ADMIN -> 403 FORBIDDEN', async () => {
      const { req, res, next, getNextCalled } = createMockHttp({
        user: { role: ROLES.EMPLOYEE, username: 'emp' },
      });

      const roleMiddleware = requireRole('ADMIN');
      roleMiddleware(req, res, next);

      assert.strictEqual(getNextCalled(), false);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.responseBody.errorCode, 'FORBIDDEN');
    });

    // -------------------------------------------------------------------------
    // TEST 10: HR Manager truy cập API chỉ dành cho Admin -> 403
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 10: HR Manager truy cập API chỉ dành cho ADMIN -> 403 FORBIDDEN', async () => {
      const { req, res, next, getNextCalled } = createMockHttp({
        user: { role: ROLES.HR_MANAGER, username: 'hr' },
      });

      const roleMiddleware = requireRole('ADMIN');
      roleMiddleware(req, res, next);

      assert.strictEqual(getNextCalled(), false);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.responseBody.errorCode, 'FORBIDDEN');
    });

    // -------------------------------------------------------------------------
    // TEST 11: Admin truy cập endpoint yêu cầu Admin -> Next
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 11: Admin truy cập endpoint yêu cầu ADMIN -> Next() được gọi thành công', async () => {
      const { req, res, next, getNextCalled } = createMockHttp({
        user: { role: ROLES.ADMIN, username: 'admin' },
      });

      const roleMiddleware = requireRole('ADMIN');
      roleMiddleware(req, res, next);

      assert.strictEqual(getNextCalled(), true);
    });

    // -------------------------------------------------------------------------
    // TEST 12: Người dùng đã bị khóa trong DB nhưng token cũ vẫn còn hạn
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 12: Tài khoản bị khóa trong DB (Locked) nhưng token còn hạn -> 403 ACCOUNT_LOCKED (Real-time DB check)', async () => {
      userRepository.findById = async () => ({
        ...mockEmployeeUser,
        account_status: 'Locked',
      });

      const { req, res, next, getNextCalled } = createMockHttp({
        headers: { authorization: `Bearer ${employeeToken}` },
      });
      await authenticateToken(req, res, next);

      assert.strictEqual(getNextCalled(), false);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.responseBody.errorCode, 'ACCOUNT_LOCKED');
    });

    // -------------------------------------------------------------------------
    // TEST 13: Người dùng có role không hợp lệ trong DB
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 13: Tài khoản có role không hợp lệ trong DB (hacker/rác) -> 403 INVALID_USER_ROLE', async () => {
      userRepository.findById = async () => ({
        ...mockEmployeeUser,
        role: 'UnknownRole999',
      });

      const { req, res, next, getNextCalled } = createMockHttp({
        headers: { authorization: `Bearer ${employeeToken}` },
      });
      await authenticateToken(req, res, next);

      assert.strictEqual(getNextCalled(), false);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.responseBody.errorCode, 'INVALID_USER_ROLE');
    });

    // -------------------------------------------------------------------------
    // TEST 14: Database gặp lỗi trong quá trình xác minh tài khoản
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 14: Database truy vấn lỗi -> Chuyển tiếp next(error) an toàn cho Error Handler', async () => {
      userRepository.findById = async () => {
        throw new Error('ECONNRESET: Database server lost connection');
      };

      const { req, res, next, getNextCalled, getNextError } = createMockHttp({
        headers: { authorization: `Bearer ${adminToken}` },
      });
      await authenticateToken(req, res, next);

      assert.strictEqual(getNextCalled(), true);
      assert.ok(getNextError(), 'Phải truyền lỗi vào next()');
      assert.ok(getNextError().message.includes('ECONNRESET'));
    });

    // -------------------------------------------------------------------------
    // TEST 15: Employee cố truy cập hồ sơ/chấm công của người khác (Ownership Guard)
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 15: Employee truy cập dữ liệu của nhân viên khác -> 403 FORBIDDEN_RESOURCE', async () => {
      // Nhân viên đang đăng nhập có employeeId = 101, cố tình truy cập employeeId = 102
      const { req, res, next, getNextCalled } = createMockHttp({
        params: { id: '102' },
        user: { role: ROLES.EMPLOYEE, employeeId: 101 },
      });

      const ownershipMiddleware = requireOwnershipOrRole({ paramName: 'id', resourceType: 'employee' });
      ownershipMiddleware(req, res, next);

      assert.strictEqual(getNextCalled(), false);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.responseBody.errorCode, 'FORBIDDEN_RESOURCE');

      // Thử nghiệm ngược lại: Nhân viên truy cập dữ liệu chính mình (101) -> Thành công!
      const validOwner = createMockHttp({
        params: { id: '101' },
        user: { role: ROLES.EMPLOYEE, employeeId: 101 },
      });
      ownershipMiddleware(validOwner.req, validOwner.res, validOwner.next);
      assert.strictEqual(validOwner.getNextCalled(), true);

      // Thử nghiệm ngược lại: Admin truy cập dữ liệu của nhân viên 102 -> Được phép bypass!
      const adminOwner = createMockHttp({
        params: { id: '102' },
        user: { role: ROLES.ADMIN, employeeId: 1 },
      });
      ownershipMiddleware(adminOwner.req, adminOwner.res, adminOwner.next);
      assert.strictEqual(adminOwner.getNextCalled(), true);
    });

  } finally {
    // Phục hồi lại hàm gốc
    userRepository.findById = originalFindById;
  }

  console.log('\n============================================================');
  console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ AUTH MIDDLEWARE & RBAC!`);
  console.log('============================================================\n');
}

startTestSuite().catch((err) => {
  console.error('Bộ kiểm thử RBAC thất bại:', err);
  process.exit(1);
});
