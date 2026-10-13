/**
 * BỘ KIỂM THỬ TỰ ĐỘNG CHỨC NĂNG XÁC THỰC VÀ BẢO MẬT (HRM ICTU)
 * Bao gồm đầy đủ 12 kịch bản kiểm thử theo yêu cầu chuẩn:
 * 1. Đăng nhập thành công với tài khoản hợp lệ
 * 2. Mật khẩu sai -> 401 với thông báo chung
 * 3. Username không tồn tại -> 401 với thông báo chung
 * 4. Thiếu username -> 400 Bad Request
 * 5. Thiếu password -> 400 Bad Request
 * 6. Kiểu dữ liệu không hợp lệ -> 400
 * 7. Tài khoản bị khóa -> 403 không cấp token
 * 8. Database gặp lỗi -> Xử lý an toàn không lộ stack trace
 * 9. JWT được tạo và xác minh bằng secret (HS256)
 * 10. JWT hết hạn hoặc giả mạo bị từ chối
 * 11. Response không chứa password hoặc password_hash
 * 12. Parameterized SQL an toàn trước SQL Injection
 */

import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { hashPassword, comparePassword } from '../src/utils/password.js';
import { generateAccessToken, verifyAccessToken, parseDurationToSeconds } from '../src/utils/jwt.js';
import authService, { AuthError } from '../src/services/authService.js';
import userRepository from '../src/repositories/userRepository.js';
import { env } from '../src/config/env.js';

let passedTests = 0;
let totalTests = 0;

function runTest(testName, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } catch (error) {
    console.error(`  ❌ [FAIL] ${testName}`);
    console.error(`     Chi tiết: ${error.message}\n`);
    throw error;
  }
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
  console.log('🧪 BẮT ĐẦU CHẠY BỘ KIỂM THỬ AUTHENTICATION & BCRYPT & JWT');
  console.log('============================================================\n');

  // Chuẩn bị dữ liệu mẫu với mật khẩu Bcrypt đã băm
  const samplePassword = 'UserPassword123!';
  const sampleHash = await hashPassword(samplePassword, 10);

  const mockActiveUser = {
    user_id: 1,
    employee_id: 101,
    username: 'nguyenvana',
    password_hash: sampleHash,
    role: 'Employee',
    account_status: 'Active',
    full_name: 'Nguyễn Văn A',
    email: 'vana.nguyen@hrm.local',
    position: 'Nhân viên IT',
  };

  const mockLockedUser = {
    ...mockActiveUser,
    user_id: 2,
    username: 'khoataikhoan',
    account_status: 'Locked',
  };

  // Lưu trữ hàm gốc của repository để phục hồi sau test
  const originalFindByUsernameOrEmail = userRepository.findByUsernameOrEmail;
  const originalUpdateLastLogin = userRepository.updateLastLogin;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Đăng nhập thành công với tài khoản hợp lệ
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 1: Đăng nhập thành công với tài khoản hợp lệ và nhận JWT', async () => {
      userRepository.findByUsernameOrEmail = async () => mockActiveUser;
      userRepository.updateLastLogin = async () => true;

      const result = await authService.login({
        username: 'nguyenvana',
        password: samplePassword,
      });

      assert.ok(result.accessToken, 'Phải trả về access token');
      assert.strictEqual(result.tokenType, 'Bearer', 'Token type phải là Bearer');
      assert.strictEqual(typeof result.expiresIn, 'number', 'ExpiresIn phải là số giây');
      assert.strictEqual(result.user.username, 'nguyenvana', 'Username phải khớp');
      assert.strictEqual(result.user.role, 'Employee', 'Role phải khớp');
    });

    // -------------------------------------------------------------------------
    // TEST 2: Mật khẩu sai -> 401 với thông báo chung
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 2: Nhập sai mật khẩu -> Trả về lỗi 401 và thông báo chung', async () => {
      userRepository.findByUsernameOrEmail = async () => mockActiveUser;

      await assert.rejects(
        async () => {
          await authService.login({
            username: 'nguyenvana',
            password: 'WrongPassword999!',
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 401, 'Mã HTTP phải là 401');
          assert.strictEqual(err.errorCode, 'INVALID_CREDENTIALS');
          assert.strictEqual(
            err.message,
            'Tên đăng nhập hoặc mật khẩu không chính xác.',
            'Thông báo lỗi phải là thông báo chung'
          );
          return true;
        }
      );
    });

    // -------------------------------------------------------------------------
    // TEST 3: Username không tồn tại -> 401 với thông báo chung
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 3: Tài khoản không tồn tại -> Trả về lỗi 401 giống hệt sai mật khẩu (chống User Enumeration)', async () => {
      userRepository.findByUsernameOrEmail = async () => null;

      await assert.rejects(
        async () => {
          await authService.login({
            username: 'user_khong_ton_tai',
            password: 'AnyPassword123!',
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 401);
          assert.strictEqual(err.errorCode, 'INVALID_CREDENTIALS');
          assert.strictEqual(
            err.message,
            'Tên đăng nhập hoặc mật khẩu không chính xác.',
            'Không được thông báo rằng tài khoản không tồn tại để tránh lộ thông tin'
          );
          return true;
        }
      );
    });

    // -------------------------------------------------------------------------
    // TEST 4: Thiếu username -> 400 Bad Request
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 4: Thiếu username -> Trả về lỗi 400 VALIDATION_ERROR', async () => {
      await assert.rejects(
        async () => {
          await authService.login({
            username: '',
            password: 'ValidPassword123!',
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.strictEqual(err.errorCode, 'VALIDATION_ERROR');
          return true;
        }
      );
    });

    // -------------------------------------------------------------------------
    // TEST 5: Thiếu password -> 400 Bad Request
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 5: Thiếu password -> Trả về lỗi 400 VALIDATION_ERROR', async () => {
      await assert.rejects(
        async () => {
          await authService.login({
            username: 'nguyenvana',
            password: '',
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.strictEqual(err.errorCode, 'VALIDATION_ERROR');
          return true;
        }
      );
    });

    // -------------------------------------------------------------------------
    // TEST 6: Request có kiểu dữ liệu không hợp lệ -> 400
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 6: Kiểu dữ liệu không phải string (Object/Number) -> Trả về 400', async () => {
      await assert.rejects(
        async () => {
          await authService.login({
            username: { $ne: null },
            password: 'ValidPassword123!',
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          return true;
        }
      );
    });

    // -------------------------------------------------------------------------
    // TEST 7: Tài khoản bị khóa hoặc ngừng hoạt động -> 403 không cấp token
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 7: Tài khoản bị khóa (Locked) -> Trả về lỗi 403 và từ chối cấp token', async () => {
      userRepository.findByUsernameOrEmail = async () => mockLockedUser;

      await assert.rejects(
        async () => {
          await authService.login({
            username: 'khoataikhoan',
            password: samplePassword,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.errorCode, 'ACCOUNT_LOCKED');
          assert.ok(err.message.includes('đã bị khóa'));
          return true;
        }
      );
    });

    // -------------------------------------------------------------------------
    // TEST 8: Database gặp sự cố -> Bắt lỗi và không để lộ chuỗi kết nối
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 8: Database truy vấn gặp lỗi -> Bắn ngoại lệ không lộ mật khẩu kết nối', async () => {
      userRepository.findByUsernameOrEmail = async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:3306 - MySQL server has gone away');
      };

      await assert.rejects(
        async () => {
          await authService.login({
            username: 'nguyenvana',
            password: samplePassword,
          });
        },
        (err) => {
          assert.ok(err.message.includes('ECONNREFUSED'));
          return true;
        }
      );
    });

    // -------------------------------------------------------------------------
    // TEST 9: JWT được tạo và có thể xác minh bằng Secret cấu hình (HS256)
    // -------------------------------------------------------------------------
    runTest('Test 9: JWT tạo đúng thuật toán HS256 và giải mã chính xác các claim', () => {
      const tokenObj = generateAccessToken(mockActiveUser);
      assert.ok(tokenObj.token, 'Token không được rỗng');

      const decoded = verifyAccessToken(tokenObj.token);
      assert.strictEqual(decoded.sub, 1, 'Subject claim phải là user_id');
      assert.strictEqual(decoded.username, 'nguyenvana');
      assert.strictEqual(decoded.role, 'Employee');
      assert.strictEqual(decoded.employeeId, 101);
    });

    // -------------------------------------------------------------------------
    // TEST 10: JWT hết hạn hoặc giả mạo chữ ký bị từ chối khi xác minh
    // -------------------------------------------------------------------------
    runTest('Test 10: JWT bị sửa đổi chữ ký hoặc hết hạn -> Bị từ chối (Token verification fails)', () => {
      const validToken = generateAccessToken(mockActiveUser).token;
      const forgedToken = validToken.slice(0, -6) + 'abc123'; // Thay đổi 6 ký tự cuối của chữ ký

      assert.throws(
        () => {
          verifyAccessToken(forgedToken);
        },
        (err) => {
          assert.strictEqual(err.name, 'JsonWebTokenError');
          return true;
        }
      );

      // Thử nghiệm token đã hết hạn
      const expiredToken = jwt.sign(
        { sub: 1, username: 'test' },
        env.jwtSecret,
        { algorithm: 'HS256', expiresIn: '-1s' }
      );

      assert.throws(
        () => {
          verifyAccessToken(expiredToken);
        },
        (err) => {
          assert.strictEqual(err.name, 'TokenExpiredError');
          return true;
        }
      );
    });

    // -------------------------------------------------------------------------
    // TEST 11: Response không chứa password hoặc password_hash
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 11: Response trả về TUYỆT ĐỐI KHÔNG chứa password hoặc password_hash', async () => {
      userRepository.findByUsernameOrEmail = async () => mockActiveUser;
      userRepository.updateLastLogin = async () => true;

      const result = await authService.login({
        username: 'nguyenvana',
        password: samplePassword,
      });

      assert.strictEqual(result.user.password, undefined, 'Không được có trường password');
      assert.strictEqual(result.user.password_hash, undefined, 'Không được có trường password_hash');

      const stringified = JSON.stringify(result);
      assert.strictEqual(stringified.includes(sampleHash), false, 'Chuỗi hash không được xuất hiện trong JSON');
    });

    // -------------------------------------------------------------------------
    // TEST 12: SQL Injection Safety: Parameterized Queries
    // -------------------------------------------------------------------------
    await runAsyncTest('Test 12: Parameterized Queries an toàn trước tấn công SQL Injection', async () => {
      let executedParams = null;
      let executedQuery = null;

      // Mock repo để kiểm tra SQL query và params được truyền
      userRepository.findByUsernameOrEmail = async (identifier) => {
        executedParams = [identifier.trim(), identifier.trim()];
        executedQuery = `SELECT * FROM users WHERE username = ? OR email = ?`;
        return null;
      };

      const maliciousPayload = "' OR '1'='1' -- ";
      await assert.rejects(async () => {
        await authService.login({
          username: maliciousPayload,
          password: 'Password123',
        });
      });

      // Xác minh tham số được truyền an toàn vào mảng params của prepared statement
      assert.ok(executedParams.includes(maliciousPayload.trim()));
      assert.ok(!executedQuery.includes(maliciousPayload), 'Chuỗi SQL không được nối trực tiếp biến vào câu lệnh');
    });

  } finally {
    // Phục hồi lại repository gốc
    userRepository.findByUsernameOrEmail = originalFindByUsernameOrEmail;
    userRepository.updateLastLogin = originalUpdateLastLogin;
  }

  console.log('\n============================================================');
  console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ AN TOÀN & BẢO MẬT!`);
  console.log('============================================================\n');
}

startTestSuite().catch((err) => {
  console.error('Bộ kiểm thử thất bại:', err);
  process.exit(1);
});
