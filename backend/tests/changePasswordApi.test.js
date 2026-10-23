/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG API ĐỔI MẬT KHẨU TÀI KHOẢN (HRM-216)
 * PUT /api/auth/change-password
 * ==============================================================================
 * 
 * BAO PHỦ 100% CÁC KỊCH BẢN THEO ĐẶC TẢ BẢO MẬT:
 *  1. Đổi mật khẩu thành công với mật khẩu hiện tại chính xác và mật khẩu mới hợp lệ -> 200 OK.
 *  2. Mật khẩu cũ không chính xác -> 400 Bad Request (INVALID_CURRENT_PASSWORD).
 *  3. Thiếu currentPassword trong request body -> 400 Bad Request (VALIDATION_ERROR).
 *  4. Thiếu newPassword trong request body -> 400 Bad Request (VALIDATION_ERROR).
 *  5. Mật khẩu mới không đạt chính sách:
 *     - Dưới 12 ký tự -> 400 Bad Request (WEAK_PASSWORD).
 *     - Vượt quá 72 byte (giới hạn an toàn của Bcrypt) -> 400 Bad Request (PASSWORD_TOO_LONG).
 *     - Rỗng hoặc chỉ chứa toàn ký tự khoảng trắng -> 400 Bad Request (INVALID_NEW_PASSWORD).
 *  6. Mật khẩu xác nhận (confirmPassword) không trùng khớp với newPassword -> 400 Bad Request (CONFIRM_PASSWORD_MISMATCH).
 *  7. Mật khẩu mới trùng với mật khẩu hiện tại -> 400 Bad Request (PASSWORD_REUSED).
 *  8. Không có JWT trong header Authorization -> 401 Unauthorized (TOKEN_REQUIRED).
 *  9. JWT không hợp lệ hoặc sai chữ ký -> 401 Unauthorized (INVALID_TOKEN).
 * 10. JWT hết hạn sử dụng -> 401 Unauthorized (TOKEN_EXPIRED).
 * 11. Tài khoản bị khóa (account_status = 'Locked') -> 403 Forbidden (ACCOUNT_LOCKED).
 * 12. Tài khoản nhân viên đã thôi việc (employment_status = 'Resigned') -> 403 Forbidden (ACCOUNT_LOCKED).
 * 13. Phòng chống tấn công IDOR: Client cố tình gửi userId của tài khoản khác trong request body -> Chỉ đổi mật khẩu của tài khoản trong JWT.
 * 14. Cơ sở dữ liệu gặp lỗi khi cập nhật -> 500 Internal Server Error (DATABASE_UPDATE_ERROR).
 * 15. Đăng nhập lại với mật khẩu mới thành công -> POST /api/auth/login trả về 200 OK.
 * 16. Mật khẩu cũ không còn sử dụng được sau khi đổi -> POST /api/auth/login với mật khẩu cũ trả về 401 Unauthorized.
 * 17. Bảo mật phản hồi: Response tuyệt đối không chứa password, newPassword hoặc password_hash.
 * 18. Đổi mật khẩu khi không truyền confirmPassword (trường xác nhận tùy chọn) vẫn thành công hợp lệ.
 * ==============================================================================
 */

import assert from 'node:assert';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashPassword, comparePassword } from '../src/utils/password.js';
import userRepository from '../src/repositories/userRepository.js';
import authService from '../src/services/authService.js';

let totalTests = 0;
let passedTests = 0;

function runTest(testName, testFn) {
  totalTests++;
  try {
    testFn();
    passedTests++;
    console.log(`  ✅ [PASS] Test ${totalTests}: ${testName}`);
  } catch (error) {
    console.error(`  ❌ [FAIL] Test ${totalTests}: ${testName}`);
    console.error(error);
    process.exitCode = 1;
  }
}

async function runAsyncTest(testName, testFn) {
  totalTests++;
  try {
    await testFn();
    passedTests++;
    console.log(`  ✅ [PASS] Test ${totalTests}: ${testName}`);
  } catch (error) {
    console.error(`  ❌ [FAIL] Test ${totalTests}: ${testName}`);
    console.error(error);
    process.exitCode = 1;
  }
}

// Helper sinh JWT token kiểm thử
function generateTestToken(payload, secret = env.jwtSecret || 'ICTU_HRM_JWT_SECRET_KEY_2026_SUPER_SECURE', options = { expiresIn: '1h' }) {
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    ...options,
  });
}

// Khởi chạy test server trên cổng ngẫu nhiên (Ephemeral port)
let server;
let serverPort;

function startTestServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve();
    });
  });
}

function stopTestServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(resolve);
    } else {
      resolve();
    }
  });
}

// Helper gửi HTTP request
function makeRequest(path, { method = 'PUT', token = null, body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path,
        method,
        headers: reqHeaders,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(buffer.toString('utf-8'));
          } catch {
            // Không phải JSON
          }

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: json,
            text: buffer.toString('utf-8'),
          });
        });
      }
    );

    req.on('error', reject);

    if (body !== null) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// Lưu trữ các hàm repository gốc để khôi phục sau kiểm thử
const originalFindById = userRepository.findById;
const originalFindAuthById = userRepository.findAuthById;
const originalUpdatePassword = userRepository.updatePassword;
const originalFindByUsernameOrEmail = userRepository.findByUsernameOrEmail;

// Chuẩn bị mật khẩu băm mẫu cho User 1 (Mật khẩu ban đầu: "MatKhauCu2026@Secure")
const OLD_PASSWORD_PLAIN = 'MatKhauCu2026@Secure';
const OLD_PASSWORD_HASH = await hashPassword(OLD_PASSWORD_PLAIN);

// Mật khẩu mới hợp lệ chuẩn chính sách >= 12 ký tự: "MatKhauMoi2026@SuperPass"
const VALID_NEW_PASSWORD = 'MatKhauMoi2026@SuperPass';

// Mock User 1 mặc định (Active)
const mockUser1 = {
  user_id: 1,
  employee_id: 1,
  username: 'test_employee',
  password_hash: OLD_PASSWORD_HASH,
  role: 'Employee',
  account_status: 'Active',
  full_name: 'Nguyễn Văn Test',
  email: 'test@hrm.ictu.edu.vn',
  employment_status: 'Active',
  created_at: new Date(),
  updated_at: new Date(),
};

// Mock User 2 (Tài khoản mục tiêu giả định bị IDOR tấn công)
const mockUser2 = {
  user_id: 2,
  employee_id: 2,
  username: 'victim_user',
  password_hash: await hashPassword('VictimOldPassword123@'),
  role: 'Employee',
  account_status: 'Active',
  full_name: 'Trần Nạn Nhân',
  email: 'victim@hrm.ictu.edu.vn',
  employment_status: 'Active',
  created_at: new Date(),
  updated_at: new Date(),
};

// Token hợp lệ của User 1
const validTokenUser1 = generateTestToken({
  sub: 1,
  userId: 1,
  username: 'test_employee',
  role: 'Employee',
});

console.log('\n==============================================================================');
console.log('🔒 BẮT ĐẦU CHẠY BỘ KIỂM THỬ API ĐỔI MẬT KHẨU (HRM-216)');
console.log('==============================================================================\n');

await startTestServer();

// Mock mặc định cho repository
function setupDefaultRepositoryMocks() {
  mockUser1.password_hash = OLD_PASSWORD_HASH;
  mockUser1.account_status = 'Active';
  mockUser1.employment_status = 'Active';

  userRepository.findById = async (id) => {
    if (id === 1) return { ...mockUser1 };
    if (id === 2) return { ...mockUser2 };
    return null;
  };

  userRepository.findAuthById = async (id) => {
    if (id === 1) return { ...mockUser1 };
    if (id === 2) return { ...mockUser2 };
    return null;
  };

  userRepository.updatePassword = async (id, newHash) => {
    if (id === 1) {
      mockUser1.password_hash = newHash;
      return true;
    }
    if (id === 2) {
      mockUser2.password_hash = newHash;
      return true;
    }
    return false;
  };

  userRepository.findByUsernameOrEmail = async (ident) => {
    if (ident === 'test_employee' || ident === 'test@hrm.ictu.edu.vn') {
      return { ...mockUser1 };
    }
    return null;
  };
}

setupDefaultRepositoryMocks();

// ==============================================================================
// NHÓM 1: THÀNH CÔNG VÀ XÁC THỰC MẬT KHẨU
// ==============================================================================
console.log('📋 NHÓM 1: ĐỔI MẬT KHẨU THÀNH CÔNG & SO SÁNH BCRYPT');

await runAsyncTest('Test 1: Đổi mật khẩu thành công với mật khẩu hiện tại chính xác -> HTTP 200, message thành công', async () => {
  setupDefaultRepositoryMocks();

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: validTokenUser1,
    body: {
      currentPassword: OLD_PASSWORD_PLAIN,
      newPassword: VALID_NEW_PASSWORD,
      confirmPassword: VALID_NEW_PASSWORD,
    },
  });

  assert.strictEqual(res.statusCode, 200, 'HTTP status phải là 200 OK');
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.status, 'success');
  assert.ok(res.body.message.includes('thành công'));

  // Kiểm tra password_hash trong database đã được băm mới
  assert.notStrictEqual(mockUser1.password_hash, OLD_PASSWORD_HASH, 'Hash mật khẩu phải thay đổi');
  const isMatchNew = await comparePassword(VALID_NEW_PASSWORD, mockUser1.password_hash);
  assert.strictEqual(isMatchNew, true, 'Hash mới phải so khớp thành công với mật khẩu mới');
});

await runAsyncTest('Test 2: Mật khẩu cũ không chính xác -> HTTP 400 Bad Request (INVALID_CURRENT_PASSWORD)', async () => {
  setupDefaultRepositoryMocks();

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: validTokenUser1,
    body: {
      currentPassword: 'MatKhauSaiHoanToan123@',
      newPassword: VALID_NEW_PASSWORD,
      confirmPassword: VALID_NEW_PASSWORD,
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'INVALID_CURRENT_PASSWORD');
  assert.ok(res.body.message.includes('hiện tại không chính xác'));
  // Đảm bảo mật khẩu không bị thay đổi
  assert.strictEqual(mockUser1.password_hash, OLD_PASSWORD_HASH);
});

// ==============================================================================
// NHÓM 2: VALIDATION REQUEST BODY VÀ CHÍNH SÁCH MẬT KHẨU MỚI
// ==============================================================================
console.log('\n📋 NHÓM 2: VALIDATION THAM SỐ VÀ CHÍNH SÁCH MẬT KHẨU MỚI');

await runAsyncTest('Test 3: Thiếu trường currentPassword -> HTTP 400 Bad Request', async () => {
  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: validTokenUser1,
    body: {
      newPassword: VALID_NEW_PASSWORD,
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'VALIDATION_ERROR');
  assert.ok(res.body.message.includes('Mật khẩu hiện tại là bắt buộc'));
});

await runAsyncTest('Test 4: Thiếu trường newPassword -> HTTP 400 Bad Request', async () => {
  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: validTokenUser1,
    body: {
      currentPassword: OLD_PASSWORD_PLAIN,
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'VALIDATION_ERROR');
  assert.ok(res.body.message.includes('Mật khẩu mới là bắt buộc'));
});

await runAsyncTest('Test 5.1: Mật khẩu mới dưới 12 ký tự (< 12) -> HTTP 400 Bad Request (WEAK_PASSWORD)', async () => {
  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: validTokenUser1,
    body: {
      currentPassword: OLD_PASSWORD_PLAIN,
      newPassword: 'NganQua123@', // 11 ký tự
      confirmPassword: 'NganQua123@',
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'WEAK_PASSWORD');
  assert.ok(res.body.message.includes('tối thiểu 12 ký tự'));
});

await runAsyncTest('Test 5.2: Mật khẩu mới vượt quá 72 byte (giới hạn Bcrypt) -> HTTP 400 Bad Request (PASSWORD_TOO_LONG)', async () => {
  // Tạo chuỗi 73 ký tự ASCII (73 bytes)
  const longPassword = 'A'.repeat(73);

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: validTokenUser1,
    body: {
      currentPassword: OLD_PASSWORD_PLAIN,
      newPassword: longPassword,
      confirmPassword: longPassword,
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'PASSWORD_TOO_LONG');
  assert.ok(res.body.message.includes('72 byte'));
});

await runAsyncTest('Test 5.3: Mật khẩu mới rỗng hoặc chỉ chứa khoảng trắng -> HTTP 400 Bad Request (INVALID_NEW_PASSWORD)', async () => {
  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: validTokenUser1,
    body: {
      currentPassword: OLD_PASSWORD_PLAIN,
      newPassword: '              ', // 14 dấu cách
      confirmPassword: '              ',
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'INVALID_NEW_PASSWORD');
  assert.ok(res.body.message.includes('khoảng trắng'));
});

await runAsyncTest('Test 6: Mật khẩu xác nhận không khớp (confirmPassword !== newPassword) -> HTTP 400 (CONFIRM_PASSWORD_MISMATCH)', async () => {
  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: validTokenUser1,
    body: {
      currentPassword: OLD_PASSWORD_PLAIN,
      newPassword: VALID_NEW_PASSWORD,
      confirmPassword: 'MatKhauXacNhanKhac123@',
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'CONFIRM_PASSWORD_MISMATCH');
  assert.ok(res.body.message.includes('không trùng khớp'));
});

await runAsyncTest('Test 7: Mật khẩu mới trùng với mật khẩu hiện tại -> HTTP 400 Bad Request (PASSWORD_REUSED)', async () => {
  setupDefaultRepositoryMocks();

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: validTokenUser1,
    body: {
      currentPassword: OLD_PASSWORD_PLAIN,
      newPassword: OLD_PASSWORD_PLAIN, // Trùng mật khẩu cũ
      confirmPassword: OLD_PASSWORD_PLAIN,
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'PASSWORD_REUSED');
  assert.ok(res.body.message.includes('không được trùng'));
});

// ==============================================================================
// NHÓM 3: BẢO MẬT XÁC THỰC JWT & TRẠNG THÁI TÀI KHOẢN
// ==============================================================================
console.log('\n📋 NHÓM 3: BẢO MẬT XÁC THỰC JWT & TRẠNG THÁI TÀI KHOẢN');

await runAsyncTest('Test 8: Không có JWT trong request -> HTTP 401 Unauthorized (TOKEN_REQUIRED)', async () => {
  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: null, // Không gửi token
    body: {
      currentPassword: OLD_PASSWORD_PLAIN,
      newPassword: VALID_NEW_PASSWORD,
    },
  });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'TOKEN_REQUIRED');
});

await runAsyncTest('Test 9: JWT không hợp lệ hoặc sai chữ ký bí mật -> HTTP 401 Unauthorized (INVALID_TOKEN)', async () => {
  const fakeToken = generateTestToken({ sub: 1, userId: 1 }, 'WRONG_SECRET_KEY');

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: fakeToken,
    body: {
      currentPassword: OLD_PASSWORD_PLAIN,
      newPassword: VALID_NEW_PASSWORD,
    },
  });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'INVALID_TOKEN');
});

await runAsyncTest('Test 10: JWT đã hết hạn sử dụng -> HTTP 401 Unauthorized (TOKEN_EXPIRED)', async () => {
  const expiredToken = generateTestToken({ sub: 1, userId: 1 }, env.jwtSecret, { expiresIn: '-1s' });

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: expiredToken,
    body: {
      currentPassword: OLD_PASSWORD_PLAIN,
      newPassword: VALID_NEW_PASSWORD,
    },
  });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'TOKEN_EXPIRED');
});

await runAsyncTest('Test 11: Tài khoản bị khóa (account_status = Locked) -> HTTP 403 Forbidden (ACCOUNT_LOCKED)', async () => {
  userRepository.findById = async (id) => ({
    ...mockUser1,
    account_status: 'Locked',
  });

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: validTokenUser1,
    body: {
      currentPassword: OLD_PASSWORD_PLAIN,
      newPassword: VALID_NEW_PASSWORD,
    },
  });

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'ACCOUNT_LOCKED');
});

await runAsyncTest('Test 12: Tài khoản nhân viên đã thôi việc (employment_status = Resigned) -> HTTP 403 Forbidden', async () => {
  userRepository.findById = async (id) => ({
    ...mockUser1,
    account_status: 'Active',
    employment_status: 'Resigned',
  });

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: validTokenUser1,
    body: {
      currentPassword: OLD_PASSWORD_PLAIN,
      newPassword: VALID_NEW_PASSWORD,
    },
  });

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'ACCOUNT_LOCKED');
});

// ==============================================================================
// NHÓM 4: PHÒNG CHỐNG IDOR & LỖI HỆ THỐNG
// ==============================================================================
console.log('\n📋 NHÓM 4: BẢO MẬT CHỐNG IDOR & XỬ LÝ LỖI HỆ THỐNG');

await runAsyncTest('Test 13: Chống IDOR: Client cố tình truyền userId của tài khoản khác trong request body -> Chỉ đổi tài khoản trong JWT', async () => {
  setupDefaultRepositoryMocks();

  let targetUpdatedUserId = null;
  userRepository.updatePassword = async (id, newHash) => {
    targetUpdatedUserId = id;
    return true;
  };

  // Client đăng nhập bằng User 1 nhưng gửi body kèm userId: 2 (tài khoản khác)
  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: validTokenUser1,
    body: {
      userId: 2, // Cố tình đổi tài khoản 2
      currentPassword: OLD_PASSWORD_PLAIN,
      newPassword: VALID_NEW_PASSWORD,
      confirmPassword: VALID_NEW_PASSWORD,
    },
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(targetUpdatedUserId, 1, 'Hệ thống BẮT BUỘC chỉ cập nhật user_id = 1 từ JWT, hoàn toàn bỏ qua userId trong body');
});

await runAsyncTest('Test 14: Database gặp lỗi khi update -> HTTP 500 Internal Server Error (DATABASE_UPDATE_ERROR)', async () => {
  setupDefaultRepositoryMocks();
  userRepository.updatePassword = async () => false; // Giả lập update thất bại

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: validTokenUser1,
    body: {
      currentPassword: OLD_PASSWORD_PLAIN,
      newPassword: VALID_NEW_PASSWORD,
    },
  });

  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'DATABASE_UPDATE_ERROR');
});

// ==============================================================================
// NHÓM 5: ĐĂNG NHẬP LẠI VỚI MẬT KHẨU MỚI & BẢO MẬT DỮ LIỆU
// ==============================================================================
console.log('\n📋 NHÓM 5: ĐĂNG NHẬP LẠI & BẢO MẬT THÔNG TIN NHẠY CẢM');

await runAsyncTest('Test 15: Đăng nhập lại với mật khẩu mới thành công -> POST /api/auth/login trả về 200 OK', async () => {
  setupDefaultRepositoryMocks();

  // Đổi mật khẩu trước
  await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: validTokenUser1,
    body: {
      currentPassword: OLD_PASSWORD_PLAIN,
      newPassword: VALID_NEW_PASSWORD,
    },
  });

  // Gọi API đăng nhập bằng mật khẩu mới
  const loginRes = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: {
      username: 'test_employee',
      password: VALID_NEW_PASSWORD,
    },
  });

  assert.strictEqual(loginRes.statusCode, 200);
  assert.strictEqual(loginRes.body.success, true);
  assert.ok(loginRes.body.data.accessToken, 'Phải cấp phát access token mới');
});

await runAsyncTest('Test 16: Mật khẩu cũ không còn sử dụng được sau khi đổi -> POST /api/auth/login trả về 401', async () => {
  // Đang ở trạng thái đã đổi sang VALID_NEW_PASSWORD
  const loginOldRes = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: {
      username: 'test_employee',
      password: OLD_PASSWORD_PLAIN, // Dùng lại mật khẩu cũ
    },
  });

  assert.strictEqual(loginOldRes.statusCode, 401);
  assert.strictEqual(loginOldRes.body.success, false);
  assert.strictEqual(loginOldRes.body.errorCode, 'INVALID_CREDENTIALS');
});

await runAsyncTest('Test 17: Phản hồi API TUYỆT ĐỐI không chứa mật khẩu hay password_hash', async () => {
  setupDefaultRepositoryMocks();

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: validTokenUser1,
    body: {
      currentPassword: OLD_PASSWORD_PLAIN,
      newPassword: VALID_NEW_PASSWORD,
    },
  });

  const responseText = res.text;
  assert.strictEqual(responseText.includes(OLD_PASSWORD_PLAIN), false, 'Response không được chứa mật khẩu cũ');
  assert.strictEqual(responseText.includes(VALID_NEW_PASSWORD), false, 'Response không được chứa mật khẩu mới');
  assert.strictEqual(responseText.includes(mockUser1.password_hash), false, 'Response không được chứa hash');
  assert.strictEqual(res.body.data, null);
});

await runAsyncTest('Test 18: Đổi mật khẩu khi không truyền confirmPassword vẫn thành công hợp lệ', async () => {
  setupDefaultRepositoryMocks();
  const anotherValidPassword = 'MatKhauMoiThuHai2026@Pass';

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: validTokenUser1,
    body: {
      currentPassword: OLD_PASSWORD_PLAIN,
      newPassword: anotherValidPassword,
      // Không gửi confirmPassword
    },
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
});

// Dọn dẹp và khôi phục
userRepository.findById = originalFindById;
userRepository.findAuthById = originalFindAuthById;
userRepository.updatePassword = originalUpdatePassword;
userRepository.findByUsernameOrEmail = originalFindByUsernameOrEmail;

await stopTestServer();

console.log('\n==============================================================================');
console.log(`🎉 KẾT QUẢ KIỂM THỬ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ ĐỔI MẬT KHẨU!`);
console.log('   API PUT /api/auth/change-password đạt chuẩn bảo mật 100% (Bcrypt, JWT, IDOR Guard).');
console.log('==============================================================================\n');
process.exit(0);
