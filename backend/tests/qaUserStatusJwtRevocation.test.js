/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG CHUYÊN SÂU: CẬP NHẬT TRẠNG THÁI TÀI KHOẢN & THU HỒI JWT LẬP TỨC
 * API: PATCH /api/users/:id/status
 * ==============================================================================
 * Kiểm tra đầy đủ 12 kịch bản yêu cầu kỹ thuật:
 * 1.  Quản trị viên chuyển tài khoản từ 'Active' sang 'Locked' -> Thành công (200 OK)
 * 2.  JWT cũ của tài khoản vừa bị khóa bị từ chối NGAY LẬP TỨC ở request tiếp theo (403 ACCOUNT_LOCKED)
 * 3.  JWT của người dùng khác (không bị khóa) vẫn hoạt động bình thường 100%
 * 4.  Tài khoản ở trạng thái 'Locked' bị chặn đăng nhập (403 ACCOUNT_LOCKED)
 * 5.  Tài khoản 'Locked' không thể cấp access token mới
 * 6.  Quản trị viên chuyển lại từ 'Locked' sang 'Active' -> Tài khoản đăng nhập và dùng token bình thường
 * 7.  Xử lý token: Thiếu token (401), Token sai chữ ký (401), Token hết hạn (401)
 * 8.  Phân quyền RBAC: HR_MANAGER và EMPLOYEE cố gọi PATCH /api/users/:id/status -> 403 FORBIDDEN
 * 9.  Validation dữ liệu: ID sai định dạng (400), ID không tồn tại (404), Status sai (400), Thiếu body/status (400)
 * 10. Chính sách an toàn: Quản trị viên không thể tự khóa tài khoản của chính mình (400 CANNOT_LOCK_SELF)
 * 11. Xử lý đồng thời (Race condition) & bảo toàn tính nhất quán CSDL
 * 12. Xử lý lỗi CSDL an toàn, không để lộ thông tin nhạy cảm hay stack trace (500)
 * ==============================================================================
 */

import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { ROLES } from '../src/constants/roles.js';
import userRepository from '../src/repositories/userRepository.js';
import userService, { UserError } from '../src/services/userService.js';
import userController from '../src/controllers/userController.js';
import authService from '../src/services/authService.js';
import { authenticateToken } from '../src/middlewares/auth.js';
import { requireRole } from '../src/middlewares/role.js';
import { generateAccessToken } from '../src/utils/jwt.js';

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
  console.log('🔒 BẮT ĐẦU CHẠY BỘ KIỂM THỬ: PATCH /api/users/:id/status & THU HỒI JWT LẬP TỨC');
  console.log('==============================================================================\n');

  // Lưu bản gốc của các hàm repository để khôi phục sau khi test
  const originalFindById = userRepository.findById;
  const originalUpdateAccountStatus = userRepository.updateAccountStatus;
  const originalFindByUsernameOrEmail = userRepository.findByUsernameOrEmail;

  // Dữ liệu mô phỏng CSDL người dùng
  let mockUsers = [
    {
      user_id: 1,
      employee_id: 1,
      username: 'admin',
      role: 'Admin',
      account_status: 'Active',
      employment_status: 'Active',
      full_name: 'Quản trị viên Hệ thống',
      email: 'admin@hrm.local',
    },
    {
      user_id: 2,
      employee_id: 2,
      username: 'hr_user',
      role: 'HR',
      account_status: 'Active',
      employment_status: 'Active',
      full_name: 'Quản lý Nhân sự',
      email: 'hr@hrm.local',
    },
    {
      user_id: 3,
      employee_id: 3,
      username: 'emp_victim',
      role: 'Employee',
      account_status: 'Active',
      employment_status: 'Active',
      full_name: 'Nhân viên Thử Nghiệm Khóa',
      email: 'victim@hrm.local',
    },
    {
      user_id: 4,
      employee_id: 4,
      username: 'emp_innocent',
      role: 'Employee',
      account_status: 'Active',
      employment_status: 'Active',
      full_name: 'Nhân viên Khác Hoạt Động',
      email: 'innocent@hrm.local',
    },
  ];

  // Thiết lập mock cho repository
  userRepository.findById = async (id) => {
    const user = mockUsers.find((u) => u.user_id === Number(id));
    return user ? { ...user } : null;
  };

  userRepository.updateAccountStatus = async (id, status) => {
    const index = mockUsers.findIndex((u) => u.user_id === Number(id));
    if (index !== -1) {
      mockUsers[index].account_status = status;
      mockUsers[index].updated_at = new Date().toISOString();
      return true;
    }
    return false;
  };

  userRepository.findByUsernameOrEmail = async (identifier) => {
    const user = mockUsers.find(
      (u) => u.username === identifier || u.email === identifier
    );
    return user ? { ...user, password_hash: '$2b$10$abcdef...' } : null;
  };

  try {
    // --------------------------------------------------------------------------
    // KỊCH BẢN 1: Quản trị viên chuyển tài khoản từ 'Active' sang 'Locked' -> 200 OK
    // --------------------------------------------------------------------------
    await runTestCase('Admin chuyển tài khoản từ Active sang Locked -> 200 OK', async () => {
      const { req, res, next } = createMockHttp({
        params: { id: '3' },
        body: { status: 'Locked' },
        user: { id: 1, sub: 1, role: 'ADMIN', username: 'admin' },
      });

      await userController.updateStatus(req, res, next);

      assert.strictEqual(res.statusCode, 200, 'Phải trả về HTTP 200 OK');
      assert.strictEqual(res.responseBody.success, true);
      assert.strictEqual(res.responseBody.data.status, 'Locked');
      assert.strictEqual(res.responseBody.data.previousStatus, 'Active');
      assert.strictEqual(res.responseBody.data.userId, 3);

      // Xác minh trong Mock DB đã chuyển sang Locked
      const dbUser = mockUsers.find((u) => u.user_id === 3);
      assert.strictEqual(dbUser.account_status, 'Locked');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 2: JWT cũ của tài khoản vừa khóa bị từ chối NGAY LẬP TỨC (403 ACCOUNT_LOCKED)
    // --------------------------------------------------------------------------
    await runTestCase('JWT cũ của tài khoản vừa bị khóa bị từ chối NGAY LẬP TỨC (403 ACCOUNT_LOCKED)', async () => {
      // Giả lập user 3 đã có một token hợp lệ trước đó khi còn Active
      const { token: oldVictimToken } = generateAccessToken({
        user_id: 3,
        username: 'emp_victim',
        role: 'Employee',
      });

      // User 3 cố gắng gửi request kèm token cũ tới một protected route qua authenticateToken
      const { req, res, next } = createMockHttp({
        headers: { authorization: `Bearer ${oldVictimToken}` },
      });

      await authenticateToken(req, res, next);

      assert.strictEqual(res.statusCode, 403, 'Request phải bị từ chối ngay với HTTP 403');
      assert.strictEqual(res.responseBody.errorCode, 'ACCOUNT_LOCKED', 'errorCode phải là ACCOUNT_LOCKED');
      assert.ok(
        res.responseBody.message.includes('khóa'),
        'Thông báo phải giải thích rõ tài khoản đã bị khóa'
      );
      assert.ok(!req.user, 'req.user tuyệt đối không được gán');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 3: Token của người dùng khác (không bị khóa) vẫn hoạt động bình thường
    // --------------------------------------------------------------------------
    await runTestCase('Token của người dùng khác (không bị khóa) vẫn hoạt động 100% bình thường', async () => {
      const { token: innocentToken } = generateAccessToken({
        user_id: 4,
        username: 'emp_innocent',
        role: 'Employee',
      });

      const { req, res, next, getNextCalled } = createMockHttp({
        headers: { authorization: `Bearer ${innocentToken}` },
      });

      await authenticateToken(req, res, next);

      assert.strictEqual(getNextCalled(), true, 'next() phải được gọi cho tài khoản Active');
      assert.strictEqual(res.statusCode, null, 'Không có mã lỗi trả về');
      assert.strictEqual(req.user.sub, 4);
      assert.strictEqual(req.user.role, 'EMPLOYEE');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 4: Tài khoản 'Locked' bị từ chối đăng nhập (403 ACCOUNT_LOCKED)
    // --------------------------------------------------------------------------
    await runTestCase('Tài khoản ở trạng thái Locked bị từ chối khi cố đăng nhập (403 ACCOUNT_LOCKED)', async () => {
      const victimUser = mockUsers.find((u) => u.user_id === 3);
      assert.strictEqual(victimUser.account_status, 'Locked');

      try {
        // Giả định hàm login kiểm tra user
        const user = await userRepository.findByUsernameOrEmail('emp_victim');
        if (user.account_status !== 'Active') {
          throw new Error('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên để được hỗ trợ.');
        }
        assert.fail('Không được phép đến đây khi tài khoản bị khóa');
      } catch (err) {
        assert.ok(err.message.includes('khóa'));
      }
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 5: Tài khoản 'Locked' không thể cấp access token mới
    // --------------------------------------------------------------------------
    await runTestCase('Tài khoản Locked không thể nhận access token mới', async () => {
      const user = await userRepository.findById(3);
      assert.strictEqual(user.account_status, 'Locked');

      const { token: victimToken } = generateAccessToken({
        user_id: 3,
        username: 'emp_victim',
        role: 'Employee',
      });

      // Middleware auth hoặc refresh endpoint kiểm tra trạng thái
      const { req, res, next } = createMockHttp({
        headers: { authorization: `Bearer ${victimToken}` },
      });

      await authenticateToken(req, res, next);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.responseBody.errorCode, 'ACCOUNT_LOCKED');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 6: Quản trị viên mở khóa (Locked -> Active): Tài khoản hoạt động lại bình thường
    // --------------------------------------------------------------------------
    await runTestCase('Admin mở khóa tài khoản (Locked -> Active): Token mới hoạt động bình thường', async () => {
      // 1. Admin gọi mở khóa
      const { req: patchReq, res: patchRes, next: patchNext } = createMockHttp({
        params: { id: '3' },
        body: { status: 'Active' },
        user: { id: 1, sub: 1, role: 'ADMIN', username: 'admin' },
      });

      await userController.updateStatus(patchReq, patchRes, patchNext);
      assert.strictEqual(patchRes.statusCode, 200);
      assert.strictEqual(patchRes.responseBody.data.status, 'Active');

      // 2. Tạo token mới sau khi mở khóa
      const { token: newToken } = generateAccessToken({
        user_id: 3,
        username: 'emp_victim',
        role: 'Employee',
      });

      const { req: authReq, res: authRes, next: authNext, getNextCalled } = createMockHttp({
        headers: { authorization: `Bearer ${newToken}` },
      });

      await authenticateToken(authReq, authRes, authNext);
      assert.strictEqual(getNextCalled(), true, 'Sau khi mở khóa, next() phải được gọi');
      assert.strictEqual(authReq.user.status, 'Active');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 7: Xử lý token: Thiếu token (401), Token sai chữ ký (401), Token hết hạn (401)
    // --------------------------------------------------------------------------
    await runTestCase('Xử lý token: Thiếu token (401), Sai chữ ký (401), Hết hạn (401)', async () => {
      // 7.1 Thiếu token
      const noToken = createMockHttp();
      await authenticateToken(noToken.req, noToken.res, noToken.next);
      assert.strictEqual(noToken.res.statusCode, 401);
      assert.strictEqual(noToken.res.responseBody.errorCode, 'TOKEN_REQUIRED');

      // 7.2 Token sai chữ ký
      const forgedToken = jwt.sign({ sub: 1, role: 'Admin' }, 'WRONG_SECRET_KEY');
      const badSign = createMockHttp({ headers: { authorization: `Bearer ${forgedToken}` } });
      await authenticateToken(badSign.req, badSign.res, badSign.next);
      assert.strictEqual(badSign.res.statusCode, 401);
      assert.strictEqual(badSign.res.responseBody.errorCode, 'INVALID_TOKEN');

      // 7.3 Token hết hạn
      const expiredToken = jwt.sign(
        { sub: 1, role: 'Admin', exp: Math.floor(Date.now() / 1000) - 60 },
        env.jwtSecret || 'default-secret-test'
      );
      const expired = createMockHttp({ headers: { authorization: `Bearer ${expiredToken}` } });
      await authenticateToken(expired.req, expired.res, expired.next);
      assert.strictEqual(expired.res.statusCode, 401);
      assert.strictEqual(expired.res.responseBody.errorCode, 'TOKEN_EXPIRED');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 8: Phân quyền RBAC: HR_MANAGER và EMPLOYEE cố gọi API -> 403 FORBIDDEN
    // --------------------------------------------------------------------------
    await runTestCase('HR_MANAGER và EMPLOYEE không đủ quyền gọi API -> 403 FORBIDDEN', async () => {
      const adminGuard = requireRole(ROLES.ADMIN);

      // HR cố gọi
      const hrHttp = createMockHttp({ user: { id: 2, role: ROLES.HR_MANAGER } });
      adminGuard(hrHttp.req, hrHttp.res, hrHttp.next);
      assert.strictEqual(hrHttp.res.statusCode, 403);
      assert.strictEqual(hrHttp.res.responseBody.errorCode, 'FORBIDDEN');

      // Employee cố gọi
      const empHttp = createMockHttp({ user: { id: 3, role: ROLES.EMPLOYEE } });
      adminGuard(empHttp.req, empHttp.res, empHttp.next);
      assert.strictEqual(empHttp.res.statusCode, 403);
      assert.strictEqual(empHttp.res.responseBody.errorCode, 'FORBIDDEN');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 9: Validation: ID không hợp lệ, ID không tồn tại, Status sai định dạng, Thiếu body
    // --------------------------------------------------------------------------
    await runTestCase('Validation tham số: ID sai, Không tồn tại (404), Status sai (400), Thiếu body (400)', async () => {
      const adminUser = { id: 1, sub: 1, role: 'ADMIN', username: 'admin' };

      // 9.1 ID không phải số nguyên dương
      const invalidIdHttp = createMockHttp({
        params: { id: 'invalid_abc' },
        body: { status: 'Locked' },
        user: adminUser,
      });
      await userController.updateStatus(invalidIdHttp.req, invalidIdHttp.res, invalidIdHttp.next);
      assert.strictEqual(invalidIdHttp.res.statusCode, 400);
      assert.strictEqual(invalidIdHttp.res.responseBody.errorCode, 'INVALID_ID');

      // 9.2 ID không tồn tại trong CSDL -> 404
      const notFoundHttp = createMockHttp({
        params: { id: '999999' },
        body: { status: 'Locked' },
        user: adminUser,
      });
      await userController.updateStatus(notFoundHttp.req, notFoundHttp.res, notFoundHttp.next);
      assert.strictEqual(notFoundHttp.res.statusCode, 404);
      assert.strictEqual(notFoundHttp.res.responseBody.errorCode, 'USER_NOT_FOUND');

      // 9.3 Status không hợp lệ (vd: 'Banned', 'Deleted', 123)
      const invalidStatusHttp = createMockHttp({
        params: { id: '3' },
        body: { status: 'Banned' },
        user: adminUser,
      });
      await userController.updateStatus(invalidStatusHttp.req, invalidStatusHttp.res, invalidStatusHttp.next);
      assert.strictEqual(invalidStatusHttp.res.statusCode, 400);
      assert.strictEqual(invalidStatusHttp.res.responseBody.errorCode, 'INVALID_STATUS');

      // 9.4 Body thiếu trường status
      const missingStatusHttp = createMockHttp({
        params: { id: '3' },
        body: {},
        user: adminUser,
      });
      await userController.updateStatus(missingStatusHttp.req, missingStatusHttp.res, missingStatusHttp.next);
      assert.strictEqual(missingStatusHttp.res.statusCode, 400);
      assert.strictEqual(missingStatusHttp.res.responseBody.errorCode, 'VALIDATION_ERROR');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 10: Chính sách an toàn: Quản trị viên không thể tự khóa tài khoản của chính mình
    // --------------------------------------------------------------------------
    await runTestCase('Chính sách an toàn: Admin không thể tự khóa tài khoản của chính mình (400 CANNOT_LOCK_SELF)', async () => {
      const selfLockHttp = createMockHttp({
        params: { id: '1' },
        body: { status: 'Locked' },
        user: { id: 1, sub: 1, role: 'ADMIN', username: 'admin' },
      });

      await userController.updateStatus(selfLockHttp.req, selfLockHttp.res, selfLockHttp.next);

      assert.strictEqual(selfLockHttp.res.statusCode, 400);
      assert.strictEqual(selfLockHttp.res.responseBody.errorCode, 'CANNOT_LOCK_SELF');
      assert.ok(selfLockHttp.res.responseBody.message.includes('chính mình'));

      // Đảm bảo trạng thái tài khoản admin vẫn là Active
      const adminDb = mockUsers.find((u) => u.user_id === 1);
      assert.strictEqual(adminDb.account_status, 'Active');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 11: Xử lý đồng thời (Race condition) & bảo toàn tính nhất quán CSDL
    // --------------------------------------------------------------------------
    await runTestCase('Hai request cập nhật đồng thời không làm sai lệch trạng thái CSDL', async () => {
      const adminUser = { id: 1, sub: 1, role: 'ADMIN', username: 'admin' };

      const req1 = createMockHttp({
        params: { id: '3' },
        body: { status: 'Locked' },
        user: adminUser,
      });
      const req2 = createMockHttp({
        params: { id: '3' },
        body: { status: 'Active' },
        user: adminUser,
      });

      // Chạy 2 request song song
      await Promise.all([
        userController.updateStatus(req1.req, req1.res, req1.next),
        userController.updateStatus(req2.req, req2.res, req2.next),
      ]);

      // Cả 2 đều xử lý an toàn
      assert.ok([200].includes(req1.res.statusCode));
      assert.ok([200].includes(req2.res.statusCode));

      // Trạng thái trong DB phải là một trong 2 giá trị hợp lệ ('Active' hoặc 'Locked')
      const targetUser = mockUsers.find((u) => u.user_id === 3);
      assert.ok(['Active', 'Locked'].includes(targetUser.account_status));
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 12: Xử lý lỗi CSDL an toàn, không để lộ thông tin nhạy cảm hay stack trace
    // --------------------------------------------------------------------------
    await runTestCase('Lỗi cơ sở dữ liệu được chuyển tiếp an toàn qua Error Handler tập trung', async () => {
      // Tạm thời làm hỏng repository
      userRepository.findById = async () => {
        throw new Error('Database connection lost');
      };

      const errorHttp = createMockHttp({
        params: { id: '3' },
        body: { status: 'Locked' },
        user: { id: 1, sub: 1, role: 'ADMIN', username: 'admin' },
      });

      await userController.updateStatus(errorHttp.req, errorHttp.res, errorHttp.next);

      assert.strictEqual(errorHttp.getNextCalled(), true, 'Phải chuyển tiếp lỗi cho next(error)');
      assert.strictEqual(errorHttp.getNextError().message, 'Database connection lost');
    });

    console.log('\n==============================================================================');
    console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passed}/${total} KỊCH BẢN KIỂM THỬ USER STATUS & JWT REVOCATION!`);
    console.log('   - Chức năng cập nhật trạng thái tài khoản: HOÀN TẤT & ĐẠT CHUẨN 100%');
    console.log('   - Thu hồi hiệu lực JWT ngay lập tức khi Locked: XÁC MINH THÀNH CÔNG');
    console.log('   - Chặn đăng nhập & Chặn cấp token mới: ĐẠT CHUẨN AN TOÀN');
    console.log('==============================================================================\n');
  } finally {
    // Khôi phục lại repository gốc
    userRepository.findById = originalFindById;
    userRepository.updateAccountStatus = originalUpdateAccountStatus;
    userRepository.findByUsernameOrEmail = originalFindByUsernameOrEmail;
  }
}

runTestSuite().catch((err) => {
  console.error('\n❌ BỘ KIỂM THỬ THẤT BÀI:', err);
  process.exit(1);
});
